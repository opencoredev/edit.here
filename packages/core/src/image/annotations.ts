/**
 * Drawings on top of an image: pen and highlighter strokes, arrows, rectangles, text, and other
 * pictures placed on the canvas (image layers).
 *
 * Annotations are stored in source space (see `geometry.ts`) so they stay on the same pixels
 * through crop, rotate and flip. The editor converts to view space (0..1 over the cropped,
 * oriented image) to draw and hit-test them. Sizes are fractions of the source's long edge.
 *
 * Text stays upright whatever the orientation. Its stored `at` is the corner of the text box that
 * is top-left in the source; after a flip or turn that corner is another corner of the upright
 * box (see `textAnchorCorner`), so a label near an edge stays near that edge and inside the image.
 */
import { clamp } from "../operations";
import type {
  AnnotationStyle,
  ImageAnnotation,
  ImageDocumentState,
  ImageLayer,
  ImageRotation,
  ImageTool,
  NormalizedPoint,
  NormalizedRect,
  StrokeAnnotation,
} from "../types";
import {
  orientedSize,
  sourceRectToView,
  viewRectToSource,
  type ImageGeometry,
  type ImageOrientation,
  type ImageSize,
} from "./geometry";

// ---------------------------------------------------------------------------
// Presets

/** Annotation colors. Content colors baked into the image, not interface colors. */
export const ANNOTATION_COLORS: ReadonlyArray<{ readonly label: string; readonly hex: string }> = [
  { label: "Red", hex: "#ff3b30" },
  { label: "Orange", hex: "#ff9500" },
  { label: "Yellow", hex: "#ffcc00" },
  { label: "Green", hex: "#34c759" },
  { label: "Blue", hex: "#0a84ff" },
  { label: "Purple", hex: "#af52de" },
  { label: "White", hex: "#ffffff" },
  { label: "Black", hex: "#1c1c1e" },
];

/** Stroke presets as fractions of the long edge. */
export const ANNOTATION_SIZES: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "Small", value: 0.0025 },
  { label: "Medium", value: 0.005 },
  { label: "Large", value: 0.01 },
];

/** Smallest and largest `size` the size slider and resize handles allow (fractions of the long edge). */
export const ANNOTATION_SIZE_MIN = 0.001;
export const ANNOTATION_SIZE_MAX = 0.03;

/** Highlighter strokes are this many times wider than the pen at the same size. */
export const HIGHLIGHTER_WIDTH_FACTOR = 4;
/** Highlighter opacity, so the image shows through the color. */
export const HIGHLIGHTER_OPACITY = 0.4;
/** Text height (font size) relative to the stroke width at the same size. */
export const TEXT_SIZE_FACTOR = 5;
/** Line height of text annotations relative to their font size. */
export const TEXT_LINE_HEIGHT = 1.25;

export type DrawingTool = Extract<ImageTool, ImageAnnotation["kind"]>;
export type StrokeKind = StrokeAnnotation["kind"];

const DRAWING_TOOLS: readonly DrawingTool[] = ["pen", "highlighter", "arrow", "rectangle", "text"];

export function isDrawingTool(tool: ImageTool): tool is DrawingTool {
  return DRAWING_TOOLS.some((t) => t === tool);
}

export function isImageLayer(annotation: ImageAnnotation): annotation is ImageLayer {
  return annotation.kind === "image";
}

export function isStrokeAnnotation(annotation: ImageAnnotation): annotation is StrokeAnnotation {
  return annotation.kind !== "image";
}

/** How many pixels of the result one unit of `size` is for a stroke of `kind`. */
function sizePixelFactor(kind: StrokeKind, longEdge: number): number {
  switch (kind) {
    case "highlighter":
      return longEdge * HIGHLIGHTER_WIDTH_FACTOR;
    case "text":
      return longEdge * TEXT_SIZE_FACTOR;
    case "pen":
    case "arrow":
    case "rectangle":
      return longEdge;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * What the size slider shows for `size`: the stroke width, or the font size for text, in pixels
 * of an image whose long edge is `longEdge`.
 */
export function annotationSizeToPixels(args: {
  readonly size: number;
  readonly kind: StrokeKind;
  readonly longEdge: number;
}): number {
  return args.size * sizePixelFactor(args.kind, args.longEdge);
}

/** The `size` that draws `pixels` wide (or tall, for text), kept inside the allowed range. */
export function annotationSizeFromPixels(args: {
  readonly pixels: number;
  readonly kind: StrokeKind;
  readonly longEdge: number;
}): number {
  const factor = sizePixelFactor(args.kind, args.longEdge);
  return factor <= 0
    ? ANNOTATION_SIZE_MIN
    : clamp(args.pixels / factor, ANNOTATION_SIZE_MIN, ANNOTATION_SIZE_MAX);
}

/** The slider's pixel range for `kind` on an image whose long edge is `longEdge`. */
export function annotationPixelRange(args: {
  readonly kind: StrokeKind;
  readonly longEdge: number;
}): { readonly min: number; readonly max: number } {
  const factor = sizePixelFactor(args.kind, args.longEdge);
  const min = Math.max(1, Math.round(ANNOTATION_SIZE_MIN * factor));
  return { min, max: Math.max(min + 1, Math.round(ANNOTATION_SIZE_MAX * factor)) };
}

// ---------------------------------------------------------------------------
// Points between spaces

function mirrorPointX(point: NormalizedPoint): NormalizedPoint {
  return { x: 1 - point.x, y: point.y };
}

/** Turns a point 90° clockwise inside the unit square (matches `rotateRectCw`). */
function rotatePointCw(point: NormalizedPoint): NormalizedPoint {
  return { x: 1 - point.y, y: point.x };
}

function rotatePointBy(point: NormalizedPoint, rotation: ImageRotation): NormalizedPoint {
  let out = point;
  for (let turned = 0; turned < rotation; turned += 90) out = rotatePointCw(out);
  return out;
}

/** Source space → oriented space. */
export function orientPoint(
  point: NormalizedPoint,
  orientation: ImageOrientation,
): NormalizedPoint {
  const mirrored = orientation.flipX ? mirrorPointX(point) : point;
  return rotatePointBy(mirrored, orientation.rotation);
}

/** Oriented space → source space. */
export function unorientPoint(
  point: NormalizedPoint,
  orientation: ImageOrientation,
): NormalizedPoint {
  const back: ImageRotation =
    orientation.rotation === 0
      ? 0
      : orientation.rotation === 180
        ? 180
        : orientation.rotation === 90
          ? 270
          : 90;
  const unrotated = rotatePointBy(point, back);
  return orientation.flipX ? mirrorPointX(unrotated) : unrotated;
}

/** Source space → view space (outside 0..1 when the point is cropped away). */
export function sourcePointToView(
  point: NormalizedPoint,
  geometry: ImageGeometry,
): NormalizedPoint {
  const oriented = orientPoint(point, geometry);
  const { crop } = geometry;
  return { x: (oriented.x - crop.x) / crop.width, y: (oriented.y - crop.y) / crop.height };
}

/** View space → source space. */
export function viewPointToSource(
  point: NormalizedPoint,
  geometry: ImageGeometry,
): NormalizedPoint {
  const { crop } = geometry;
  return unorientPoint(
    { x: crop.x + point.x * crop.width, y: crop.y + point.y * crop.height },
    geometry,
  );
}

function mapAnnotation<A extends ImageAnnotation>(
  annotation: A,
  point: (p: NormalizedPoint) => NormalizedPoint,
  rect: (r: NormalizedRect) => NormalizedRect,
): A;
function mapAnnotation(
  annotation: ImageAnnotation,
  point: (p: NormalizedPoint) => NormalizedPoint,
  rect: (r: NormalizedRect) => NormalizedRect,
): ImageAnnotation {
  switch (annotation.kind) {
    case "pen":
    case "highlighter":
      return { ...annotation, points: annotation.points.map(point) };
    case "arrow":
      return { ...annotation, from: point(annotation.from), to: point(annotation.to) };
    case "rectangle":
    case "image":
      return { ...annotation, rect: rect(annotation.rect) };
    case "text":
      return { ...annotation, at: point(annotation.at) };
    default: {
      const _exhaustive: never = annotation;
      return _exhaustive;
    }
  }
}

/** The annotation with its geometry in view space. */
export function annotationToView<A extends ImageAnnotation>(
  annotation: A,
  geometry: ImageGeometry,
): A {
  return mapAnnotation(
    annotation,
    (p) => sourcePointToView(p, geometry),
    (r) => sourceRectToView(r, geometry),
  );
}

/** An annotation drawn in view space, stored back in source space. */
export function annotationToSource<A extends ImageAnnotation>(
  annotation: A,
  geometry: ImageGeometry,
): A {
  return mapAnnotation(
    annotation,
    (p) => viewPointToSource(p, geometry),
    (r) => viewRectToSource(r, geometry),
  );
}

/** Moves an annotation by a view-space offset; the result stays in source space. */
export function moveAnnotation<A extends ImageAnnotation>(args: {
  readonly annotation: A;
  readonly dx: number;
  readonly dy: number;
  readonly geometry: ImageGeometry;
}): A {
  const { annotation, dx, dy, geometry } = args;
  const view = annotationToView(annotation, geometry);
  const moved = mapAnnotation(
    view,
    (p) => ({ x: p.x + dx, y: p.y + dy }),
    (r) => ({ ...r, x: r.x + dx, y: r.y + dy }),
  );
  return annotationToSource(moved, geometry);
}

// ---------------------------------------------------------------------------
// Sizes in pixels

/**
 * Pixels per source pixel when the cropped image is shown `viewWidth` pixels wide. Multiply a
 * source-pixel length by it to get a view-pixel length.
 */
export function viewScale(args: {
  readonly source: ImageSize;
  readonly geometry: ImageGeometry;
  readonly viewWidth: number;
}): number {
  const oriented = orientedSize(args.source, args.geometry.rotation);
  const cropWidth = args.geometry.crop.width * oriented.width;
  return cropWidth <= 0 ? 0 : args.viewWidth / cropWidth;
}

/** Line width in pixels for an annotation at `scale` (pixels per source pixel). */
export function annotationLineWidth(
  annotation: Pick<StrokeAnnotation, "kind" | "size">,
  source: ImageSize,
  scale: number,
): number {
  const base = annotation.size * Math.max(source.width, source.height) * scale;
  return annotation.kind === "highlighter" ? base * HIGHLIGHTER_WIDTH_FACTOR : base;
}

/** Stroke width in pixels, or 0 for an image layer (it has no stroke). */
function strokeWidthOf(annotation: ImageAnnotation, source: ImageSize, scale: number): number {
  return isImageLayer(annotation) ? 0 : annotationLineWidth(annotation, source, scale);
}

/** Font size in pixels for a text annotation at `scale`. */
export function annotationFontSize(
  annotation: Pick<StrokeAnnotation, "size">,
  source: ImageSize,
  scale: number,
): number {
  return annotation.size * Math.max(source.width, source.height) * scale * TEXT_SIZE_FACTOR;
}

/** Arrowhead length and half-width in pixels for a line of `lineWidth`. */
export function arrowHeadSize(lineWidth: number): {
  readonly length: number;
  readonly halfWidth: number;
} {
  const length = Math.max(10, lineWidth * 4);
  return { length, halfWidth: length * 0.6 };
}

/** Rough text width when no renderer is available to measure it. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

export type TextMeasure = (text: string, fontSize: number) => number;

// ---------------------------------------------------------------------------
// Text boxes

/**
 * Which corner of the upright text box the stored anchor is on under `orientation`. The box
 * extends from the anchor along the source's +x and +y axes as they appear on screen, so when
 * either axis points left the anchor is on the right edge, and when either points up it is on
 * the bottom edge.
 */
export function textAnchorCorner(orientation: ImageOrientation): {
  readonly right: boolean;
  readonly bottom: boolean;
} {
  const origin = orientPoint({ x: 0, y: 0 }, orientation);
  const xAxis = orientPoint({ x: 1, y: 0 }, orientation);
  const yAxis = orientPoint({ x: 0, y: 1 }, orientation);
  const u = { x: xAxis.x - origin.x, y: xAxis.y - origin.y };
  const v = { x: yAxis.x - origin.x, y: yAxis.y - origin.y };
  return { right: u.x < 0 || v.x < 0, bottom: u.y < 0 || v.y < 0 };
}

/** Size in pixels of a block of text lines at `fontSize`. */
export function textBlockSize(text: string, fontSize: number, measure: TextMeasure): ImageSize {
  const lines = text.split("\n");
  return {
    width: Math.max(0, ...lines.map((line) => measure(line, fontSize))),
    height: lines.length * fontSize * TEXT_LINE_HEIGHT,
  };
}

/** What places a text box on the view surface, apart from its anchor or top-left. */
export type TextLayout = {
  readonly text: string;
  /** Font size in view pixels. */
  readonly fontSize: number;
  /** View size in pixels. */
  readonly view: ImageSize;
  readonly orientation: ImageOrientation;
  readonly measure: TextMeasure;
};

/** Size in view space and the offset from the anchor to the top-left corner. */
function textOffset(layout: TextLayout): {
  readonly width: number;
  readonly height: number;
  readonly dx: number;
  readonly dy: number;
} {
  const block = textBlockSize(layout.text, layout.fontSize, layout.measure);
  const width = layout.view.width > 0 ? block.width / layout.view.width : 0;
  const height = layout.view.height > 0 ? block.height / layout.view.height : 0;
  const corner = textAnchorCorner(layout.orientation);
  return { width, height, dx: corner.right ? width : 0, dy: corner.bottom ? height : 0 };
}

/** The upright text box in view space for a text whose anchor is at `anchor` (view space). */
export function textAnnotationBox(
  args: TextLayout & { readonly anchor: NormalizedPoint },
): NormalizedRect {
  const { width, height, dx, dy } = textOffset(args);
  return { x: args.anchor.x - dx, y: args.anchor.y - dy, width, height };
}

/** The anchor (view space) that puts a text box's top-left corner at `topLeft`. */
export function textAnchorFromTopLeft(
  args: TextLayout & { readonly topLeft: NormalizedPoint },
): NormalizedPoint {
  const { dx, dy } = textOffset(args);
  return { x: args.topLeft.x + dx, y: args.topLeft.y + dy };
}

// ---------------------------------------------------------------------------
// Hit testing (view pixels)

type PixelPoint = { readonly x: number; readonly y: number };

function distanceToSegment(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToPolyline(p: PixelPoint, points: readonly PixelPoint[]): number {
  const [first] = points;
  if (first === undefined) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(p.x - first.x, p.y - first.y);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) best = Math.min(best, distanceToSegment(p, a, b));
  }
  return best;
}

/** Size of the view surface the annotations are drawn on, and how to measure text. */
export type HitContext = {
  readonly source: ImageSize;
  readonly geometry: ImageGeometry;
  /** View size in pixels. */
  readonly view: ImageSize;
  readonly measureText?: TextMeasure;
};

/** Bounds of an annotation in view space (0..1), including its stroke. */
export function annotationBounds(
  annotation: ImageAnnotation,
  context: HitContext,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  const { view } = context;
  const scale = viewScale({
    source: context.source,
    geometry: context.geometry,
    viewWidth: view.width,
  });
  const shown = annotationToView(annotation, context.geometry);
  const pad = strokeWidthOf(annotation, context.source, scale) / 2;
  const box = (xs: readonly number[], ys: readonly number[], padPx: number) => {
    const x0 = Math.min(...xs) - padPx / view.width;
    const y0 = Math.min(...ys) - padPx / view.height;
    const x1 = Math.max(...xs) + padPx / view.width;
    const y1 = Math.max(...ys) + padPx / view.height;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  };
  switch (shown.kind) {
    case "pen":
    case "highlighter":
      return box(
        shown.points.map((p) => p.x),
        shown.points.map((p) => p.y),
        pad,
      );
    case "arrow": {
      const head = arrowHeadSize(pad * 2);
      return box(
        [shown.from.x, shown.to.x],
        [shown.from.y, shown.to.y],
        Math.max(pad, head.halfWidth),
      );
    }
    case "rectangle":
      return box(
        [shown.rect.x, shown.rect.x + shown.rect.width],
        [shown.rect.y, shown.rect.y + shown.rect.height],
        pad,
      );
    case "image":
      return shown.rect;
    case "text":
      return textAnnotationBox({
        anchor: shown.at,
        text: shown.text,
        fontSize: annotationFontSize(shown, context.source, scale),
        view,
        orientation: context.geometry,
        measure: context.measureText ?? estimateTextWidth,
      });
    default: {
      const _exhaustive: never = shown;
      return _exhaustive;
    }
  }
}

/** True when `point` (view space) is on the annotation, within `tolerance` view pixels. */
export function hitsAnnotation(args: {
  readonly annotation: ImageAnnotation;
  readonly point: NormalizedPoint;
  readonly context: HitContext;
  readonly tolerance?: number;
}): boolean {
  const { annotation, point, context } = args;
  const tolerance = args.tolerance ?? 6;
  const { view } = context;
  const toPx = (p: NormalizedPoint): PixelPoint => ({ x: p.x * view.width, y: p.y * view.height });
  const scale = viewScale({
    source: context.source,
    geometry: context.geometry,
    viewWidth: view.width,
  });
  const reach = strokeWidthOf(annotation, context.source, scale) / 2 + tolerance;
  const p = toPx(point);
  const shown = annotationToView(annotation, context.geometry);
  switch (shown.kind) {
    case "pen":
    case "highlighter":
      return distanceToPolyline(p, shown.points.map(toPx)) <= reach;
    case "arrow":
      return (
        distanceToPolyline(p, [toPx(shown.from), toPx(shown.to)]) <= Math.max(reach, tolerance * 2)
      );
    case "rectangle": {
      const { x, y, width, height } = shown.rect;
      const corners = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
        { x, y },
      ].map(toPx);
      return distanceToPolyline(p, corners) <= reach;
    }
    case "text":
    case "image": {
      const b = annotationBounds(annotation, context);
      const padX = tolerance / view.width;
      const padY = tolerance / view.height;
      return (
        point.x >= b.x - padX &&
        point.x <= b.x + b.width + padX &&
        point.y >= b.y - padY &&
        point.y <= b.y + b.height + padY
      );
    }
    default: {
      const _exhaustive: never = shown;
      return _exhaustive;
    }
  }
}

/** The topmost annotation under `point` (view space), or null. */
export function annotationAt(args: {
  readonly annotations: readonly ImageAnnotation[];
  readonly point: NormalizedPoint;
  readonly context: HitContext;
  readonly tolerance?: number;
}): ImageAnnotation | null {
  for (let i = args.annotations.length - 1; i >= 0; i -= 1) {
    const annotation = args.annotations[i];
    if (annotation === undefined) continue;
    if (
      hitsAnnotation({
        annotation,
        point: args.point,
        context: args.context,
        ...(args.tolerance === undefined ? {} : { tolerance: args.tolerance }),
      })
    ) {
      return annotation;
    }
  }
  return null;
}

/** True when a drawn annotation is big enough to keep (a click is not a drawing). */
export function isUsableAnnotation(annotation: ImageAnnotation, view: ImageSize): boolean {
  const min = 3;
  const span = (points: readonly NormalizedPoint[]) => {
    const xs = points.map((p) => p.x * view.width);
    const ys = points.map((p) => p.y * view.height);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  switch (annotation.kind) {
    case "pen":
    case "highlighter":
      return annotation.points.length > 1 && span(annotation.points) >= min;
    case "arrow":
      return span([annotation.from, annotation.to]) >= min * 3;
    case "rectangle":
      return (
        annotation.rect.width * view.width >= min && annotation.rect.height * view.height >= min
      );
    case "text":
      return annotation.text.trim() !== "";
    case "image":
      return annotation.rect.width > 0 && annotation.rect.height > 0;
    default: {
      const _exhaustive: never = annotation;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Document edits

export function addImageAnnotation(
  state: ImageDocumentState,
  annotation: ImageAnnotation,
): ImageDocumentState {
  return {
    ...state,
    annotations: [...state.annotations, annotation],
    selectedAnnotationId: annotation.id,
  };
}

export function replaceImageAnnotation(
  state: ImageDocumentState,
  annotation: ImageAnnotation,
): ImageDocumentState {
  return {
    ...state,
    annotations: state.annotations.map((a) => (a.id === annotation.id ? annotation : a)),
  };
}

export function removeImageAnnotation(state: ImageDocumentState, id: string): ImageDocumentState {
  return {
    ...state,
    annotations: state.annotations.filter((a) => a.id !== id),
    selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
  };
}

/**
 * Sets the color and stroke for new drawings. In select mode, where the selection box is on
 * screen, it also restyles the selected drawing; with a drawing tool active it never touches an
 * existing drawing. Image layers have no color or stroke and are left alone.
 */
export function applyAnnotationStyle(
  state: ImageDocumentState,
  patch: Partial<AnnotationStyle>,
): ImageDocumentState {
  const style = { ...state.annotationStyle, ...patch };
  const selected = state.tool === "select" ? state.selectedAnnotationId : null;
  return {
    ...state,
    annotationStyle: style,
    annotations:
      selected === null
        ? state.annotations
        : state.annotations.map((a) =>
            a.id === selected && isStrokeAnnotation(a) ? { ...a, ...patch } : a,
          ),
  };
}

/**
 * Switches tools. Only select mode shows the selection, so every other tool drops it; changing
 * the color for a new drawing then can't quietly restyle an old one.
 */
export function selectImageTool(state: ImageDocumentState, tool: ImageTool): ImageDocumentState {
  return {
    ...state,
    tool,
    selectedAnnotationId: tool === "select" ? state.selectedAnnotationId : null,
  };
}

/** The selected annotation while it is on screen (select mode), or null. */
export function selectedAnnotation(state: ImageDocumentState): ImageAnnotation | null {
  if (state.tool !== "select" || state.selectedAnnotationId === null) return null;
  return state.annotations.find((a) => a.id === state.selectedAnnotationId) ?? null;
}

// ---------------------------------------------------------------------------
// Order, duplicate

function moveInOrder(state: ImageDocumentState, id: string, delta: 1 | -1): ImageDocumentState {
  const index = state.annotations.findIndex((a) => a.id === id);
  const target = index + delta;
  const item = state.annotations[index];
  const other = state.annotations[target];
  if (index < 0 || item === undefined || other === undefined) return state;
  const annotations = [...state.annotations];
  annotations[index] = other;
  annotations[target] = item;
  return { ...state, annotations };
}

/** Moves an annotation one step up the paint order (drawn later, on top). */
export function bringAnnotationForward(state: ImageDocumentState, id: string): ImageDocumentState {
  return moveInOrder(state, id, 1);
}

/** Moves an annotation one step down the paint order. */
export function sendAnnotationBackward(state: ImageDocumentState, id: string): ImageDocumentState {
  return moveInOrder(state, id, -1);
}

/** Where an annotation sits in the paint order, for enabling the order buttons. */
export function annotationOrder(
  state: ImageDocumentState,
  id: string,
): { readonly atFront: boolean; readonly atBack: boolean } {
  const index = state.annotations.findIndex((a) => a.id === id);
  return { atFront: index === state.annotations.length - 1, atBack: index <= 0 };
}

/**
 * Copies an annotation as `newId`, shifted by `offset` in view space, directly above the
 * original, and selects the copy.
 */
export function duplicateImageAnnotation(args: {
  readonly state: ImageDocumentState;
  readonly id: string;
  readonly newId: string;
  readonly offset: NormalizedPoint;
}): ImageDocumentState {
  const { state } = args;
  const index = state.annotations.findIndex((a) => a.id === args.id);
  const original = state.annotations[index];
  if (original === undefined) return state;
  const copy = {
    ...moveAnnotation({
      annotation: original,
      dx: args.offset.x,
      dy: args.offset.y,
      geometry: state,
    }),
    id: args.newId,
  };
  const annotations = [...state.annotations];
  annotations.splice(index + 1, 0, copy);
  return { ...state, annotations, selectedAnnotationId: args.newId };
}
