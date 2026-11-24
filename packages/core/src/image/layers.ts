/**
 * Image layers and direct manipulation: where pasted pictures go, how far the composition
 * reaches, and the corner and endpoint handles that resize a selected annotation.
 *
 * All handle math runs in view space (0..1 over the cropped base image) and converts back to
 * source space at the end, like `moveAnnotation`. Aspect ratios are compared in view pixels, so a
 * locked resize keeps the shape the user sees.
 */
import { clamp, clampNormalizedRect, FULL_RECT } from "../operations";
import type {
  ImageAnnotation,
  ImageDocumentState,
  ImageLayer,
  NormalizedPoint,
  NormalizedRect,
} from "../types";
import {
  annotationBounds,
  annotationFontSize,
  ANNOTATION_SIZE_MAX,
  ANNOTATION_SIZE_MIN,
  annotationToSource,
  annotationToView,
  estimateTextWidth,
  isImageLayer,
  textAnchorFromTopLeft,
  viewPointToSource,
  viewScale,
  type HitContext,
} from "./annotations";
import { sourceRectToView, viewRectToSource, type ImageGeometry, type ImageSize } from "./geometry";
import { croppedPixelSize } from "./layout";

// ---------------------------------------------------------------------------
// Composition bounds

/** The base image in view space. */
export const BASE_VIEW_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * How far past the base image, in base widths and heights, the composition may reach. A layer
 * dragged further out is clipped rather than growing the canvas without end.
 */
export const COMPOSITION_REACH = 4;

/** The smallest rect holding every rect in `rects`. */
export function unionRects(
  first: NormalizedRect,
  ...rest: readonly NormalizedRect[]
): NormalizedRect {
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x + first.width;
  let y1 = first.y + first.height;
  for (const r of rest) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Image layers in paint order. */
export function imageLayers(annotations: readonly ImageAnnotation[]): readonly ImageLayer[] {
  return annotations.filter(isImageLayer);
}

/**
 * The area the result covers, in view space: the base image plus every image layer, within
 * `COMPOSITION_REACH`. Exactly `BASE_VIEW_RECT` when every layer sits on the base image, so a
 * document without outlying layers lays out as it always has.
 */
export function imageCompositionBounds(
  annotations: readonly ImageAnnotation[],
  geometry: ImageGeometry,
): NormalizedRect {
  const layers = imageLayers(annotations);
  if (layers.length === 0) return BASE_VIEW_RECT;
  const union = unionRects(
    BASE_VIEW_RECT,
    ...layers.map((layer) => sourceRectToView(layer.rect, geometry)),
  );
  const x0 = clamp(union.x, -COMPOSITION_REACH, 0);
  const y0 = clamp(union.y, -COMPOSITION_REACH, 0);
  const x1 = clamp(union.x + union.width, 1, 1 + COMPOSITION_REACH);
  const y1 = clamp(union.y + union.height, 1, 1 + COMPOSITION_REACH);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** True when the composition reaches past the base image. */
export function isExpandedComposition(bounds: NormalizedRect): boolean {
  return (
    bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 1 || bounds.y + bounds.height > 1
  );
}

/** A shape that casts the frame shadow: the base image or a layer, in view space. */
export type CompositionPiece = {
  readonly rect: NormalizedRect;
  /** Corner radius in base-image source pixels; null for the base (it takes the frame radius). */
  readonly radius: number | null;
};

export function compositionPieces(
  annotations: readonly ImageAnnotation[],
  geometry: ImageGeometry,
): readonly CompositionPiece[] {
  return [
    { rect: BASE_VIEW_RECT, radius: null },
    ...imageLayers(annotations).map((layer) => ({
      rect: sourceRectToView(layer.rect, geometry),
      radius: layer.radius,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Placing a pasted picture

/** Gap between a placed layer and what is already on the canvas, in base view widths. */
const PLACE_GAP = 0.04;

/** How far each layer that finds no free row is stepped from the one before, in base view units. */
const CASCADE_STEP = 0.08;

function rectsOverlap(a: NormalizedRect, b: NormalizedRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when `r` lies wholly inside the reach `COMPOSITION_REACH` allows. */
function fitsComposition(r: NormalizedRect): boolean {
  const lo = -COMPOSITION_REACH;
  const hi = 1 + COMPOSITION_REACH;
  const eps = 1e-9;
  return (
    r.x >= lo - eps && r.y >= lo - eps && r.x + r.width <= hi + eps && r.y + r.height <= hi + eps
  );
}

/**
 * Where a new layer of `size` (view units) goes, given the pieces already on the canvas:
 *
 * 1. To the right of everything, top-aligned, while that stays inside the composition reach.
 * 2. Else after the last layer in its row, when that spot is inside the reach and free.
 * 3. Else at the start of a new row below everything (`x = 0`).
 * 4. Else stepped diagonally inside the current bounds, clamped so it stays fully inside the reach.
 */
export function imageLayerPlacement(args: {
  readonly bounds: NormalizedRect;
  readonly pieces: readonly NormalizedRect[];
  readonly last: NormalizedRect | null;
  readonly size: { readonly width: number; readonly height: number };
}): NormalizedRect {
  const { bounds, pieces, last, size } = args;
  const at = (x: number, y: number): NormalizedRect => ({ x, y, ...size });
  const free = (r: NormalizedRect) => fitsComposition(r) && !pieces.some((p) => rectsOverlap(p, r));

  const right = at(bounds.x + bounds.width + PLACE_GAP, bounds.y);
  if (fitsComposition(right)) return right;
  if (last !== null) {
    const next = at(last.x + last.width + PLACE_GAP, last.y);
    if (free(next)) return next;
  }
  const below = at(0, bounds.y + bounds.height + PLACE_GAP);
  if (fitsComposition(below)) return below;

  const lo = -COMPOSITION_REACH;
  const hi = 1 + COMPOSITION_REACH;
  const step = CASCADE_STEP * pieces.length;
  const spanX = Math.max(0, bounds.width - size.width);
  const spanY = Math.max(0, bounds.height - size.height);
  return at(
    clamp(bounds.x + (spanX > 0 ? step % spanX : 0), lo, hi - size.width),
    clamp(bounds.y + (spanY > 0 ? step % spanY : 0), lo, hi - size.height),
  );
}

/**
 * Adds a picture as an image layer beside everything on the canvas (see `imageLayerPlacement`),
 * at one picture pixel per base pixel, shrunk so it is no bigger than the base image and fits the
 * composition reach. Switches to select mode with the new layer selected, so it can be dragged
 * straight away. Every placed layer lies wholly inside the composition, so none is clipped.
 *
 * The picture fills its source-space rect and turns with the canvas. On a canvas turned a
 * quarter, the rect is laid out with the picture's sides swapped so it is not stretched.
 */
export function placeImageLayer(args: {
  readonly state: ImageDocumentState;
  /** Base image size. */
  readonly source: ImageSize;
  readonly natural: ImageSize;
  readonly id: string;
  readonly assetId: string;
}): ImageDocumentState {
  const { state, source, natural } = args;
  const crop = croppedPixelSize(source, state);
  const quarter = state.rotation === 90 || state.rotation === 270;
  const naturalWidth = quarter ? natural.height : natural.width;
  const naturalHeight = quarter ? natural.width : natural.height;
  const longest = Math.max(naturalWidth, naturalHeight);
  const reach = 1 + COMPOSITION_REACH;
  const scale =
    longest <= 0 || naturalWidth <= 0 || naturalHeight <= 0
      ? 1
      : Math.min(
          1,
          Math.max(crop.width, crop.height) / longest,
          (reach * crop.width) / naturalWidth,
          (reach * crop.height) / naturalHeight,
        );
  const layers = imageLayers(state.annotations);
  const lastLayer = layers.at(-1);
  const view = imageLayerPlacement({
    bounds: imageCompositionBounds(state.annotations, state),
    pieces: compositionPieces(state.annotations, state).map((piece) => piece.rect),
    last: lastLayer === undefined ? null : sourceRectToView(lastLayer.rect, state),
    size: {
      width: (naturalWidth * scale) / crop.width,
      height: (naturalHeight * scale) / crop.height,
    },
  });
  const layer: ImageLayer = {
    id: args.id,
    kind: "image",
    assetId: args.assetId,
    rect: viewRectToSource(view, state),
    naturalWidth: natural.width,
    naturalHeight: natural.height,
    radius: 0,
  };
  return {
    ...state,
    tool: "select",
    annotations: [...state.annotations, layer],
    selectedAnnotationId: layer.id,
  };
}

// ---------------------------------------------------------------------------
// Cropping a layer

/** The part of a layer's picture it shows, in 0..1 of the picture: its crop, or all of it. */
export function imageLayerCrop(layer: ImageLayer): NormalizedRect {
  return layer.crop ?? FULL_RECT;
}

/** A layer's shown part in picture pixels, rounded, for the crop readout. */
export function imageLayerCropPixels(
  layer: ImageLayer,
  crop: NormalizedRect = imageLayerCrop(layer),
): ImageSize {
  return {
    width: Math.max(1, Math.round(layer.naturalWidth * crop.width)),
    height: Math.max(1, Math.round(layer.naturalHeight * crop.height)),
  };
}

/**
 * The layer showing `crop` of its picture instead of its current crop. The pixels it keeps stay
 * where they are on the canvas at the same scale: the layer's rect shrinks or grows around them,
 * so the cropped piece neither stretches nor jumps. Widening the crop again (or back to the whole
 * picture) brings the layer back to where it was.
 */
export function cropImageLayer(layer: ImageLayer, crop: NormalizedRect): ImageLayer {
  const before = imageLayerCrop(layer);
  const next = clampNormalizedRect(crop);
  const r = layer.rect;
  // Base source units per unit of picture, along each side.
  const kx = before.width > 0 ? r.width / before.width : r.width;
  const ky = before.height > 0 ? r.height / before.height : r.height;
  return {
    ...layer,
    crop: next,
    rect: {
      x: r.x + (next.x - before.x) * kx,
      y: r.y + (next.y - before.y) * ky,
      width: next.width * kx,
      height: next.height * ky,
    },
  };
}

/** `state` with image layer `id` cropped to `crop` (see `cropImageLayer`). */
export function setImageLayerCrop(args: {
  readonly state: ImageDocumentState;
  readonly id: string;
  readonly crop: NormalizedRect;
}): ImageDocumentState {
  const { state, id, crop } = args;
  let changed = false;
  const annotations = state.annotations.map((a) => {
    if (a.id !== id || a.kind !== "image") return a;
    changed = true;
    return cropImageLayer(a, crop);
  });
  return changed ? { ...state, annotations } : state;
}

/** Largest radius slider value for a layer: half its shorter side, in base source pixels. */
export function maxLayerRadius(layer: ImageLayer, source: ImageSize): number {
  return Math.floor(
    Math.min(layer.rect.width * source.width, layer.rect.height * source.height) / 2,
  );
}

// ---------------------------------------------------------------------------
// Handles

export type CornerHandle = "nw" | "ne" | "sw" | "se";
/** Corners resize a box; `from` and `to` are an arrow's ends. */
export type AnnotationHandle = CornerHandle | "from" | "to";

export const CORNER_HANDLES: readonly CornerHandle[] = ["nw", "ne", "sw", "se"];

function cornerPoint(box: NormalizedRect, corner: CornerHandle): NormalizedPoint {
  const east = corner === "ne" || corner === "se";
  const south = corner === "sw" || corner === "se";
  return { x: east ? box.x + box.width : box.x, y: south ? box.y + box.height : box.y };
}

/** The handles a selected annotation offers, in view space. */
export function annotationHandles(
  annotation: ImageAnnotation,
  context: HitContext,
): readonly { readonly handle: AnnotationHandle; readonly point: NormalizedPoint }[] {
  if (annotation.kind === "arrow") {
    const view = annotationToView(annotation, context.geometry);
    return [
      { handle: "from", point: view.from },
      { handle: "to", point: view.to },
    ];
  }
  const box = annotationBounds(annotation, context);
  return CORNER_HANDLES.map((handle) => ({ handle, point: cornerPoint(box, handle) }));
}

/**
 * Drags `corner` of `box` by (dx, dy), all in view space, keeping the opposite corner fixed.
 * `view` is the view size in pixels; sides never shrink below `minPixels`. With `keepAspect`,
 * the drag is projected onto the box's diagonal so the shape stays the same.
 */
export function resizeBox(args: {
  readonly box: NormalizedRect;
  readonly corner: CornerHandle;
  readonly dx: number;
  readonly dy: number;
  readonly view: ImageSize;
  readonly keepAspect: boolean;
  readonly minPixels?: number;
}): NormalizedRect {
  const { box, corner, view } = args;
  const vw = view.width > 0 ? view.width : 1;
  const vh = view.height > 0 ? view.height : 1;
  const min = args.minPixels ?? 8;
  const east = corner === "ne" || corner === "se";
  const south = corner === "sw" || corner === "se";
  const sx = east ? 1 : -1;
  const sy = south ? 1 : -1;
  const w = box.width * vw;
  const h = box.height * vh;
  const fixedX = (east ? box.x : box.x + box.width) * vw;
  const fixedY = (south ? box.y : box.y + box.height) * vh;
  let width = w + sx * args.dx * vw;
  let height = h + sy * args.dy * vh;
  if (args.keepAspect && w > 0 && h > 0) {
    const t = Math.max((width * w + height * h) / (w * w + h * h), min / w, min / h);
    width = w * t;
    height = h * t;
  } else {
    width = Math.max(min, width);
    height = Math.max(min, height);
  }
  const x = east ? fixedX : fixedX - width;
  const y = south ? fixedY : fixedY - height;
  return { x: x / vw, y: y / vh, width: width / vw, height: height / vh };
}

/** Maps a point from one box onto another (each axis scaled about the box's corner). */
function mapBetween(p: NormalizedPoint, from: NormalizedRect, to: NormalizedRect): NormalizedPoint {
  return {
    x: from.width > 0 ? to.x + ((p.x - from.x) * to.width) / from.width : p.x + to.x - from.x,
    y: from.height > 0 ? to.y + ((p.y - from.y) * to.height) / from.height : p.y + to.y - from.y,
  };
}

function mapRectBetween(
  r: NormalizedRect,
  from: NormalizedRect,
  to: NormalizedRect,
): NormalizedRect {
  const a = mapBetween({ x: r.x, y: r.y }, from, to);
  const b = mapBetween({ x: r.x + r.width, y: r.y + r.height }, from, to);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/**
 * The box a resize stretches, in view space: a rectangle's own rect or a stroke's points, without
 * the stroke width; an image layer's rect; text's laid-out box.
 */
export function annotationShapeBounds(
  annotation: ImageAnnotation,
  context: HitContext,
): NormalizedRect {
  const shown = annotationToView(annotation, context.geometry);
  switch (shown.kind) {
    case "rectangle": {
      const r = shown.rect;
      const x0 = Math.min(r.x, r.x + r.width);
      const y0 = Math.min(r.y, r.y + r.height);
      return { x: x0, y: y0, width: Math.abs(r.width), height: Math.abs(r.height) };
    }
    case "pen":
    case "highlighter": {
      const xs = shown.points.map((p) => p.x);
      const ys = shown.points.map((p) => p.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
    }
    case "arrow":
    case "image":
    case "text":
      return annotationBounds(annotation, context);
    default: {
      const _exhaustive: never = shown;
      return _exhaustive;
    }
  }
}

/**
 * The annotation after dragging `handle` by (dx, dy) in view space, from where it was when the
 * drag began; the result is in source space.
 *
 * - Rectangles and strokes stretch freely (`keepAspect` locks the shape).
 * - Image layers keep their shape unless `keepAspect` is false.
 * - Text always scales evenly: the corner scales the font size, the opposite corner stays put.
 * - Arrows move the dragged end.
 */
export function resizeAnnotation(args: {
  readonly annotation: ImageAnnotation;
  readonly handle: AnnotationHandle;
  readonly dx: number;
  readonly dy: number;
  readonly context: HitContext;
  readonly keepAspect: boolean;
  /** Smallest side in view pixels. */
  readonly minPixels?: number;
}): ImageAnnotation {
  const { annotation, handle, dx, dy, context } = args;
  const geometry = context.geometry;
  if (annotation.kind === "arrow") {
    if (handle !== "from" && handle !== "to") return annotation;
    const view = annotationToView(annotation, geometry);
    const shift = (p: NormalizedPoint): NormalizedPoint => ({ x: p.x + dx, y: p.y + dy });
    return annotationToSource(
      handle === "from" ? { ...view, from: shift(view.from) } : { ...view, to: shift(view.to) },
      geometry,
    );
  }
  if (handle === "from" || handle === "to") return annotation;
  // Strokes and rectangles resize their geometry, not their stroke-padded outline: the pad is a
  // fixed number of pixels, so scaling it with the box would drift the opposite corner.
  const before = annotationShapeBounds(annotation, context);
  const keepAspect = annotation.kind === "text" ? true : args.keepAspect;
  const after = resizeBox({
    box: before,
    corner: handle,
    dx,
    dy,
    view: context.view,
    keepAspect,
    ...(args.minPixels === undefined ? {} : { minPixels: args.minPixels }),
  });
  switch (annotation.kind) {
    case "rectangle": {
      const view = annotationToView(annotation, geometry);
      return annotationToSource(
        { ...view, rect: mapRectBetween(view.rect, before, after) },
        geometry,
      );
    }
    case "image":
      return annotationToSource({ ...annotation, rect: after }, geometry);
    case "pen":
    case "highlighter": {
      const view = annotationToView(annotation, geometry);
      return annotationToSource(
        { ...view, points: view.points.map((p) => mapBetween(p, before, after)) },
        geometry,
      );
    }
    case "text": {
      const factor = before.width > 0 ? after.width / before.width : 1;
      const size = clamp(annotation.size * factor, ANNOTATION_SIZE_MIN, ANNOTATION_SIZE_MAX);
      const applied = annotation.size > 0 ? size / annotation.size : 1;
      const width = before.width * applied;
      const height = before.height * applied;
      const east = handle === "ne" || handle === "se";
      const south = handle === "sw" || handle === "se";
      // The corner opposite the handle stays where it was.
      const topLeft = {
        x: east ? before.x : before.x + before.width - width,
        y: south ? before.y : before.y + before.height - height,
      };
      const scale = viewScale({ source: context.source, geometry, viewWidth: context.view.width });
      const anchor = textAnchorFromTopLeft({
        topLeft,
        text: annotation.text,
        fontSize: annotationFontSize({ size }, context.source, scale),
        view: context.view,
        orientation: geometry,
        measure: context.measureText ?? estimateTextWidth,
      });
      return { ...annotation, size, at: viewPointToSource(anchor, geometry) };
    }
    default: {
      const _exhaustive: never = annotation;
      return _exhaustive;
    }
  }
}
