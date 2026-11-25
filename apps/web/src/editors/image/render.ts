/**
 * Canvas pipeline shared by the live preview and the export, so both draw the same pixels:
 *
 * 1. Draw the oriented, cropped source into a composition canvas: the base image, plus room
 *    for any image layers placed beside it (`layout.content`).
 * 2. Destroy the pixels under each redaction on that canvas (fill, or downsample and upscale).
 * 2b. Draw the annotations in paint order: pen, highlighter, arrow, rectangle, text and image
 *     layers. A layer is redacted again where a redaction box covers it, so pasting a picture
 *     over a redacted area never brings the hidden pixels back.
 * 3. Composite onto the output: background, shadow, then the composition clipped to its corners.
 *
 * Geometry and sizing come from `@edit-here/core`; this file only issues canvas calls.
 */
import {
  annotationBounds,
  annotationFontSize,
  annotationLineWidth,
  annotationToView,
  arrowHeadSize,
  baseRectInContent,
  compositionPieces,
  computeImageLayout,
  imageCompositionBounds,
  HIGHLIGHTER_OPACITY,
  imageLayerCrop,
  TEXT_LINE_HEIGHT,
  coverPixels,
  exportFormatInfo,
  gradientLine,
  intersectRects,
  orientationMatrix,
  parseCanvasBackground,
  planRedactionRepaint,
  redactionCellSize,
  resolveExportBackground,
  SAFE_CANVAS_PIXELS,
  scaleToFitArea,
  sourceRectToView,
  textAnnotationBox,
  viewRectToCanvasPixels,
  type ExportBackground,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageExportFormat,
  type ImageLayout,
  type ImageSize,
  type NormalizedPoint,
  type NormalizedRect,
  type PixelOffset,
  type PixelRect,
  type RedactionBox,
  type RedactionFootprint,
  type RedactionRepaintPlan,
} from "@edit-here/core";

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Decoded pictures for image layers, by asset id. A missing one is skipped until it decodes. The
 * size is the decoded picture's own (a preview may be smaller than the file), which a layer's
 * crop is measured against.
 */
export type LayerSources = ReadonlyMap<string, ImageBitmap>;

const NO_LAYERS: LayerSources = new Map();

/** Matte for formats without alpha. Content color, not UI. */
const MATTE = "#ffffff";
const BLACKOUT = "#000000";

export function createCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** True for a page canvas; false for an OffscreenCanvas, including in a worker (no DOM there). */
function isPageCanvas(canvas: AnyCanvas): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement;
}

export function context2d(canvas: AnyCanvas): Ctx {
  // Both canvas types return their own 2D context type for "2d"; narrow by canvas type.
  const ctx = isPageCanvas(canvas) ? canvas.getContext("2d") : canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("The browser could not allocate a canvas this large.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

// ---------------------------------------------------------------------------
// Step 1 + 2: oriented crop with redactions

type DocGeometry = Pick<ImageDocumentState, "crop" | "rotation" | "flipX">;

/** Maps base source pixels onto the composition canvas, like the base image is drawn. */
function applySourceTransform(args: {
  ctx: Ctx;
  layout: ImageLayout;
  geometry: DocGeometry;
  sourceSize: ImageSize;
}): void {
  const { ctx, layout } = args;
  const base = baseRectInContent(layout);
  ctx.translate(base.x, base.y);
  ctx.scale(base.width / layout.cropPixels.width, base.height / layout.cropPixels.height);
  ctx.translate(-layout.cropPixels.x, -layout.cropPixels.y);
  const [a, b, c, d, e, f] = orientationMatrix(args.geometry, args.sourceSize);
  ctx.transform(a, b, c, d, e, f);
}

function roundedPath(ctx: Ctx, rect: PixelRect, radius: number): void {
  ctx.beginPath();
  if (radius > 0) ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  else ctx.rect(rect.x, rect.y, rect.width, rect.height);
}

/** Redaction boxes in composition pixels, for one render. */
type RedactionPass = {
  readonly redactions: readonly RedactionBox[];
  readonly geometry: DocGeometry;
  readonly layout: ImageLayout;
  readonly sourceSize: ImageSize;
  /**
   * Ids of the blur boxes a gesture is drawing or moving, which skip the final soften pass (see
   * `applyRedaction`). Exports and the stage at rest pass none.
   */
  readonly drafts: ReadonlySet<string>;
};

/** No boxes drawn at draft quality. */
export const NO_DRAFTS: ReadonlySet<string> = new Set();

/** One redaction box placed on a render's canvas: its exact pixel rect and cell size. */
type PlacedRedaction = {
  readonly redaction: RedactionBox;
  readonly px: PixelRect;
  readonly cell: number;
  /** A blur drawn without its soften pass, while a gesture moves it. */
  readonly draft: boolean;
};

/** Places the redactions on the canvas, limited to `within` (view space) when given. */
function placeRedactions(pass: RedactionPass, within: NormalizedRect | null): PlacedRedaction[] {
  const base = baseRectInContent(pass.layout);
  const k = base.width / pass.layout.cropPixels.width;
  // Cell size follows the full image's long edge at this render's scale, so a preview and
  // the export blur and pixelate alike.
  const scaledLongEdge = Math.max(pass.sourceSize.width, pass.sourceSize.height) * k;
  const unit = { x: 0, y: 0, width: 1, height: 1 };
  const placed: PlacedRedaction[] = [];
  for (const redaction of pass.redactions) {
    const onImage = intersectRects(sourceRectToView(redaction.rect, pass.geometry), unit);
    const view = onImage === null || within === null ? onImage : intersectRects(onImage, within);
    if (view === null) continue;
    const covered = coverPixels(view, { width: base.width, height: base.height });
    const px = { ...covered, x: covered.x + base.x, y: covered.y + base.y };
    if (px.width <= 0 || px.height <= 0) continue;
    placed.push({
      redaction,
      px,
      cell: redactionCellSize({ intensity: redaction.intensity, imageLongEdge: scaledLongEdge }),
      draft: redaction.style === "blur" && pass.drafts.has(redaction.id),
    });
  }
  return placed;
}

/** Applies the redactions to the canvas, limited to `within` (view space) when given. */
function applyRedactions(
  ctx: Ctx,
  canvas: AnyCanvas,
  pass: RedactionPass,
  within: NormalizedRect | null,
): void {
  for (const placed of placeRedactions(pass, within)) applyRedaction({ ctx, canvas, ...placed });
}

/**
 * Draws the cropped, oriented image and applies the redactions on a canvas the size of the
 * composition (`layout.content`). `source` may be smaller than the full image (a preview);
 * `sourceSize` is the full size.
 */
export function renderImageCanvas(args: {
  source: CanvasImageSource;
  sourceSize: ImageSize;
  geometry: DocGeometry;
  redactions: readonly RedactionBox[];
  /** Drawn after the redactions. Omit to get the image without drawings (preview cache). */
  annotations?: readonly ImageAnnotation[];
  layers?: LayerSources;
  layout: ImageLayout;
}): AnyCanvas {
  const { layout, geometry, sourceSize } = args;
  const canvas = createCanvas(layout.content.width, layout.content.height);
  const ctx = context2d(canvas);
  const base = baseRectInContent(layout);
  ctx.save();
  // The source outside the crop would otherwise show around the base in a wider composition.
  roundedPath(ctx, base, layout.baseRadius);
  ctx.clip();
  applySourceTransform({ ctx, layout, geometry, sourceSize });
  ctx.drawImage(args.source, 0, 0, sourceSize.width, sourceSize.height);
  ctx.restore();

  const pass: RedactionPass = {
    redactions: args.redactions,
    geometry,
    layout,
    sourceSize,
    drafts: NO_DRAFTS,
  };
  applyRedactions(ctx, canvas, pass, null);
  if (args.annotations !== undefined && args.annotations.length > 0) {
    drawAnnotations({
      ctx,
      canvas,
      annotations: args.annotations,
      geometry,
      sourceSize,
      layout,
      layers: args.layers ?? NO_LAYERS,
      redactions: args.redactions,
    });
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Live preview: redactions repainted where they changed

/**
 * How far past its own rect a blur or pixelate box may read, in cells plus pixels. The spec lets
 * a downsample filter read source pixels outside the source rect, and mipmapped sampling reaches
 * a few texels (each at most a cell wide) past it; a sub-pixel rect reads one pixel more.
 * Chromium's software canvas showed no reach at all, so this is a margin for other engines and
 * GPUs. A wider reach only re-runs more neighbouring boxes; it never restores more pixels.
 */
const READ_REACH_CELLS = 4;
const READ_REACH_PX = 4;

function clampToCanvas(x0: number, y0: number, x1: number, y1: number, size: ImageSize): PixelRect {
  const left = Math.max(0, Math.min(size.width, x0));
  const top = Math.max(0, Math.min(size.height, y0));
  const right = Math.max(left, Math.min(size.width, x1));
  const bottom = Math.max(top, Math.min(size.height, y1));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Which whole pixels a placed box writes and reads; equal keys mean identical results. */
function redactionFootprint(placed: PlacedRedaction, size: ImageSize): RedactionFootprint {
  const { px, cell, redaction, draft } = placed;
  const x0 = Math.floor(px.x);
  const y0 = Math.floor(px.y);
  const x1 = Math.ceil(px.x + px.width);
  const y1 = Math.ceil(px.y + px.height);
  const reach = redaction.style === "blackout" ? 0 : READ_REACH_CELLS * cell + READ_REACH_PX;
  return {
    key: `${redaction.style}|${draft ? "draft" : "exact"}|${cell}|${px.x},${px.y},${px.width},${px.height}`,
    write: clampToCanvas(x0, y0, x1, y1, size),
    read: clampToCanvas(x0 - reach, y0 - reach, x1 + reach, y1 + reach, size),
  };
}

/** The inputs a redacted canvas was drawn from; equal inputs mean equal pixels. */
type RedactedContent = {
  readonly source: CanvasImageSource;
  /** The base image's geometry and placement (see `render`). */
  readonly baseKey: string;
  readonly boxes: readonly RedactionFootprint[];
};

type RedactedBuffer = {
  readonly canvas: AnyCanvas;
  /** What the canvas holds, or null while it holds nothing usable. */
  holds: RedactedContent | null;
};

function holdsExactly(buffer: RedactedBuffer, content: RedactedContent): boolean {
  const { holds } = buffer;
  return (
    holds !== null &&
    holds.source === content.source &&
    holds.baseKey === content.baseKey &&
    planRedactionRepaint({ previous: holds.boxes, next: content.boxes }).kind === "none"
  );
}

/**
 * Each placed box's footprint on a composition of `layout`, as `createRedactedCanvasCache`
 * records them: equal lists mean equal redacted pixels.
 */
export function redactionFootprints(args: {
  redactions: readonly RedactionBox[];
  geometry: DocGeometry;
  layout: ImageLayout;
  sourceSize: ImageSize;
  drafts: ReadonlySet<string>;
}): RedactionFootprint[] {
  return placeRedactions(args, null).map((p) => redactionFootprint(p, args.layout.content));
}

export type RedactedCanvasCache = {
  /**
   * The same pixels as `renderImageCanvas` without annotations. Returns a canvas already holding
   * exactly those pixels when there is one, and otherwise draws into a canvas that is neither
   * the last one returned nor the retained one, so the result is a new object whenever its
   * pixels differ from either.
   */
  readonly render: (args: {
    source: CanvasImageSource;
    sourceSize: ImageSize;
    geometry: DocGeometry;
    redactions: readonly RedactionBox[];
    layout: ImageLayout;
    drafts: ReadonlySet<string>;
  }) => AnyCanvas;
  /**
   * Marks the canvas the screen now shows (call it from a layout effect with what the committed
   * render got). Later calls never draw into it, so a render React throws away can't change the
   * pixels of the one it keeps.
   */
  readonly retain: (canvas: AnyCanvas) => void;
};

/**
 * The preview's redacted image. Keeps the unredacted base per geometry and a few canvases it
 * reuses, so a box drawn or a strength dragged restores and re-runs only the boxes the change can
 * reach, not the whole image and every blur.
 *
 * Calls come from render, which React may repeat or throw away. So each canvas records exactly
 * what it holds, and the cache never draws into the canvas on screen (`retain`) or the one it
 * returned last: at most three canvases, and two while every render commits.
 */
export function createRedactedCanvasCache(): RedactedCanvasCache {
  let baseSource: CanvasImageSource | null = null;
  let baseKey = "";
  let base: AnyCanvas | null = null;
  let buffers: RedactedBuffer[] = [];
  // What the last call returned: the base itself when there were no boxes, else a buffer.
  let last: AnyCanvas | null = null;
  // What the committed render returned, as far as the last `retain` call said.
  let retained: AnyCanvas | null = null;

  return {
    retain(canvas) {
      retained = canvas;
    },
    render(args) {
      const { layout, geometry, sourceSize } = args;
      const rect = baseRectInContent(layout);
      const key = JSON.stringify([
        sourceSize.width,
        sourceSize.height,
        geometry.crop,
        geometry.rotation,
        geometry.flipX,
        layout.content.width,
        layout.content.height,
        rect,
        layout.cropPixels,
        layout.baseRadius,
      ]);
      if (base === null || baseSource !== args.source || baseKey !== key) {
        // A new canvas, never drawn into after this, so one handed out earlier keeps its pixels.
        base = renderImageCanvas({ ...args, redactions: [] });
        baseSource = args.source;
        baseKey = key;
        const fresh = base;
        // Buffers of another size are dropped, not redrawn: one may still be on screen.
        buffers = buffers.filter(
          (b) => b.canvas.width === fresh.width && b.canvas.height === fresh.height,
        );
      }
      const size = { width: base.width, height: base.height };
      const pass: RedactionPass = {
        redactions: args.redactions,
        geometry,
        layout,
        sourceSize,
        drafts: args.drafts,
      };
      const placed = placeRedactions(pass, null);
      const content: RedactedContent = {
        source: args.source,
        baseKey: key,
        boxes: placed.map((p) => redactionFootprint(p, size)),
      };
      // Nothing to redact: the base is the result, and nothing ever draws on it.
      if (content.boxes.length === 0) {
        last = base;
        return base;
      }
      const ready = buffers.find((b) => holdsExactly(b, content));
      if (ready !== undefined) {
        last = ready.canvas;
        return ready.canvas;
      }

      let target = buffers.find((b) => b.canvas !== last && b.canvas !== retained);
      if (target === undefined) {
        target = { canvas: createCanvas(size.width, size.height), holds: null };
        buffers.push(target);
      }
      const ctx = context2d(target.canvas);
      const plan: RedactionRepaintPlan =
        target.holds === null ||
        target.holds.source !== content.source ||
        target.holds.baseKey !== content.baseKey
          ? { kind: "full" }
          : planRedactionRepaint({ previous: target.holds.boxes, next: content.boxes });
      switch (plan.kind) {
        case "none":
          break;
        case "full":
          ctx.clearRect(0, 0, size.width, size.height);
          // A 1:1 copy; nearest sampling keeps it exact under any smoothing quality.
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(base, 0, 0);
          ctx.imageSmoothingEnabled = true;
          for (const p of placed) applyRedaction({ ctx, canvas: target.canvas, ...p });
          break;
        case "partial": {
          // Rect by rect: cheaper than a clip path, and overlaps just copy the same pixels again.
          ctx.imageSmoothingEnabled = false;
          for (const r of plan.region) {
            ctx.clearRect(r.x, r.y, r.width, r.height);
            ctx.drawImage(base, r.x, r.y, r.width, r.height, r.x, r.y, r.width, r.height);
          }
          ctx.imageSmoothingEnabled = true;
          for (const index of plan.reapply) {
            const p = placed[index];
            if (p !== undefined) applyRedaction({ ctx, canvas: target.canvas, ...p });
          }
          break;
        }
        default: {
          const _exhaustive: never = plan;
          return _exhaustive;
        }
      }
      target.holds = content;
      last = target.canvas;
      return target.canvas;
    },
  };
}

// ---------------------------------------------------------------------------
// Step 2b: annotations

const TEXT_FONT_FAMILY = '"Sidebar Inter", system-ui, sans-serif';
const TEXT_FONT_WEIGHT = 600;

function textFont(fontSize: number): string {
  return `${TEXT_FONT_WEIGHT} ${fontSize}px ${TEXT_FONT_FAMILY}`;
}

let measureContext: Ctx | null = null;

/** Width in pixels of one line of annotation text at `fontSize`, as the renderer draws it. */
export function measureAnnotationText(text: string, fontSize: number): number {
  measureContext ??= context2d(createCanvas(1, 1));
  measureContext.font = textFont(fontSize);
  return measureContext.measureText(text).width;
}

function tracePolyline(ctx: Ctx, points: readonly { x: number; y: number }[]): void {
  const [first, ...rest] = points;
  if (first === undefined) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  if (rest.length === 0) {
    // A dot: a zero-length line still gets round caps.
    ctx.lineTo(first.x + 0.01, first.y);
    return;
  }
  // Smooth through midpoints so fast strokes don't look like polygons.
  for (let i = 0; i < rest.length - 1; i += 1) {
    const p = rest[i];
    const q = rest[i + 1];
    if (p === undefined || q === undefined) continue;
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  const last = rest[rest.length - 1];
  if (last !== undefined) ctx.lineTo(last.x, last.y);
}

/**
 * Draws annotations onto the composition canvas (`layout.content` sized), in paint order. The
 * base image sits at `baseRectInContent(layout)`; view space is relative to it.
 */
export function drawAnnotations(args: {
  ctx: Ctx;
  canvas: AnyCanvas;
  annotations: readonly ImageAnnotation[];
  geometry: DocGeometry;
  sourceSize: ImageSize;
  layout: ImageLayout;
  layers: LayerSources;
  /** Re-applied over each image layer they cover. */
  redactions: readonly RedactionBox[];
}): void {
  const { ctx, geometry, sourceSize, layout } = args;
  const base = baseRectInContent(layout);
  const size = { width: base.width, height: base.height };
  // Pixels per source pixel.
  const scale = base.width / layout.cropPixels.width;
  const px = (p: NormalizedPoint) => ({
    x: base.x + p.x * size.width,
    y: base.y + p.y * size.height,
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, layout.content.width, layout.content.height);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const annotation of args.annotations) {
    if (annotation.kind === "image") {
      const picture = args.layers.get(annotation.assetId);
      if (picture === undefined) continue;
      ctx.save();
      applySourceTransform({ ctx, layout, geometry, sourceSize });
      const r = annotation.rect;
      const rect = {
        x: r.x * sourceSize.width,
        y: r.y * sourceSize.height,
        width: r.width * sourceSize.width,
        height: r.height * sourceSize.height,
      };
      roundedPath(ctx, rect, Math.min(annotation.radius, Math.min(rect.width, rect.height) / 2));
      ctx.clip();
      // Only the layer's crop of its picture fills the rect.
      const crop = imageLayerCrop(annotation);
      ctx.drawImage(
        picture,
        crop.x * picture.width,
        crop.y * picture.height,
        crop.width * picture.width,
        crop.height * picture.height,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
      ctx.restore();
      applyRedactions(
        ctx,
        args.canvas,
        { redactions: args.redactions, geometry, layout, sourceSize, drafts: NO_DRAFTS },
        sourceRectToView(annotation.rect, geometry),
      );
      continue;
    }
    const view = annotationToView(annotation, geometry);
    const lineWidth = annotationLineWidth(annotation, sourceSize, scale);
    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;
    ctx.lineWidth = lineWidth;
    switch (view.kind) {
      case "pen":
        tracePolyline(ctx, view.points.map(px));
        ctx.stroke();
        break;
      case "highlighter":
        // One path per stroke, so a stroke crossing itself doesn't darken where it overlaps.
        ctx.globalAlpha = HIGHLIGHTER_OPACITY;
        ctx.lineCap = "butt";
        tracePolyline(ctx, view.points.map(px));
        ctx.stroke();
        break;
      case "arrow": {
        const from = px(view.from);
        const to = px(view.to);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const head = arrowHeadSize(lineWidth);
        const headLength = Math.min(head.length, length * 0.6);
        const halfWidth = head.halfWidth * (headLength / head.length);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // The shaft stops inside the head so its round cap doesn't poke through the tip.
        const shaftEnd = { x: to.x - cos * headLength * 0.8, y: to.y - sin * headLength * 0.8 };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(shaftEnd.x, shaftEnd.y);
        ctx.stroke();
        const headBase = { x: to.x - cos * headLength, y: to.y - sin * headLength };
        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(headBase.x - sin * halfWidth, headBase.y + cos * halfWidth);
        ctx.lineTo(headBase.x + sin * halfWidth, headBase.y - cos * halfWidth);
        ctx.closePath();
        ctx.lineWidth = Math.max(1, lineWidth / 3);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "rectangle": {
        const r = view.rect;
        const corner = px(r);
        ctx.strokeRect(corner.x, corner.y, r.width * size.width, r.height * size.height);
        break;
      }
      case "text": {
        const fontSize = annotationFontSize(view, sourceSize, scale);
        ctx.font = textFont(fontSize);
        ctx.textBaseline = "top";
        // Text stays upright; the anchor's corner of its box follows the orientation.
        const box = textAnnotationBox({
          anchor: view.at,
          text: view.text,
          fontSize,
          view: size,
          orientation: geometry,
          measure: measureAnnotationText,
        });
        const topLeft = px(box);
        view.text.split("\n").forEach((line, index) => {
          ctx.fillText(line, topLeft.x, topLeft.y + index * fontSize * TEXT_LINE_HEIGHT);
        });
        break;
      }
      default: {
        const _exhaustive: never = view;
        return _exhaustive;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * The pixels of the composition canvas that drawing `annotation` can touch, or null when none
 * are on it. Generous by a couple of pixels so antialiased edges and arrowhead outlines fit.
 */
export function annotationPaintRect(args: {
  annotation: ImageAnnotation;
  geometry: DocGeometry;
  sourceSize: ImageSize;
  layout: ImageLayout;
}): PixelRect | null {
  const { annotation, geometry, sourceSize, layout } = args;
  const base = baseRectInContent(layout);
  const scale = base.width / layout.cropPixels.width;
  const view = annotationBounds(annotation, {
    source: sourceSize,
    geometry,
    view: { width: base.width, height: base.height },
    measureText: measureAnnotationText,
  });
  switch (annotation.kind) {
    case "image":
      return viewRectToCanvasPixels({ view, base, margin: 2, size: layout.content });
    case "text": {
      // Glyphs can reach well past the layout box (stacked combining marks, swashes, fallback
      // fonts), so the measured ink of each line joins it. The margin is a further allowance.
      const fontSize = annotationFontSize(annotation, sourceSize, scale);
      const ink = textInkRect({
        text: annotation.text,
        fontSize,
        topLeft: { x: base.x + view.x * base.width, y: base.y + view.y * base.height },
      });
      if (ink === null) {
        return { x: 0, y: 0, width: layout.content.width, height: layout.content.height };
      }
      const x0 = Math.min(view.x, (ink.x - base.x) / base.width);
      const y0 = Math.min(view.y, (ink.y - base.y) / base.height);
      const x1 = Math.max(view.x + view.width, (ink.x + ink.width - base.x) / base.width);
      const y1 = Math.max(view.y + view.height, (ink.y + ink.height - base.y) / base.height);
      return viewRectToCanvasPixels({
        view: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        base,
        margin: fontSize / 2 + 2,
        size: layout.content,
      });
    }
    case "pen":
    case "highlighter":
    case "arrow":
    case "rectangle": {
      // `annotationBounds` already holds half the stroke and the arrowhead; this adds another half.
      const reach = annotationLineWidth(annotation, sourceSize, scale) / 2;
      return viewRectToCanvasPixels({ view, base, margin: reach + 2, size: layout.content });
    }
    default: {
      const _exhaustive: never = annotation;
      return _exhaustive;
    }
  }
}

/**
 * The ink of a text annotation drawn with its first line's top-left at `topLeft`, as
 * `drawAnnotations` draws it, in canvas pixels. Null when the browser can't measure ink.
 */
function textInkRect(args: {
  text: string;
  fontSize: number;
  topLeft: { readonly x: number; readonly y: number };
}): PixelRect | null {
  const { fontSize, topLeft } = args;
  measureContext ??= context2d(createCanvas(1, 1));
  const ctx = measureContext;
  ctx.font = textFont(fontSize);
  ctx.textBaseline = "top";
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  const lines = args.text.split("\n");
  for (const [index, line] of lines.entries()) {
    const m = ctx.measureText(line);
    const left = m.actualBoundingBoxLeft;
    const right = m.actualBoundingBoxRight;
    const ascent = m.actualBoundingBoxAscent;
    const descent = m.actualBoundingBoxDescent;
    if (![left, right, ascent, descent].every(Number.isFinite)) return null;
    const top = topLeft.y + index * fontSize * TEXT_LINE_HEIGHT;
    x0 = Math.min(x0, topLeft.x - left);
    x1 = Math.max(x1, topLeft.x + right);
    y0 = Math.min(y0, top - ascent);
    y1 = Math.max(y1, top + descent);
  }
  if (!(x1 >= x0 && y1 >= y0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Paints `under` (a composition canvas, its origin at `underAt`) and then `annotations` over it
 * onto the top-left `size` of `canvas`, only inside `region` when given. What lands inside the
 * region is exactly what a full repaint would put there.
 */
export function paintComposition(args: {
  ctx: Ctx;
  canvas: AnyCanvas;
  size: ImageSize;
  under: AnyCanvas;
  underAt: PixelOffset;
  region: PixelRect | null;
  annotations: readonly ImageAnnotation[];
  geometry: DocGeometry;
  sourceSize: ImageSize;
  layout: ImageLayout;
  layers: LayerSources;
  redactions: readonly RedactionBox[];
}): void {
  const { ctx, canvas, under, underAt } = args;
  const r = args.region ?? { x: 0, y: 0, width: args.size.width, height: args.size.height };
  ctx.save();
  if (args.region !== null) {
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.clip();
  }
  ctx.clearRect(r.x, r.y, r.width, r.height);
  if (underAt.x === 0 && underAt.y === 0) {
    ctx.drawImage(under, r.x, r.y, r.width, r.height, r.x, r.y, r.width, r.height);
  } else {
    ctx.drawImage(under, underAt.x, underAt.y);
  }
  if (args.annotations.length > 0) {
    drawAnnotations({
      ctx,
      canvas,
      annotations: args.annotations,
      geometry: args.geometry,
      sourceSize: args.sourceSize,
      layout: args.layout,
      layers: args.layers,
      redactions: args.redactions,
    });
  }
  ctx.restore();
}

function applyRedaction(args: {
  ctx: Ctx;
  canvas: AnyCanvas;
  px: PixelRect;
  redaction: RedactionBox;
  cell: number;
  draft: boolean;
}): void {
  const { ctx, canvas, px, redaction, cell, draft } = args;
  switch (redaction.style) {
    case "blackout":
      ctx.fillStyle = BLACKOUT;
      ctx.fillRect(px.x, px.y, px.width, px.height);
      return;
    case "pixelate":
    case "blur": {
      // Downsampling to one sample per cell throws the detail away for good; the upscale
      // only decides whether the result looks blocky or soft.
      const cols = Math.max(1, Math.ceil(px.width / cell));
      const rows = Math.max(1, Math.ceil(px.height / cell));
      const small = createCanvas(cols, rows);
      const sctx = context2d(small);
      sctx.drawImage(canvas, px.x, px.y, px.width, px.height, 0, 0, cols, rows);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px.x, px.y, px.width, px.height);
      ctx.clip();
      // Wipe the region first: drawing over it would let the original show through wherever
      // the downsampled copy is transparent (text on a transparent PNG).
      ctx.clearRect(px.x, px.y, px.width, px.height);
      if (redaction.style === "pixelate") {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, cols, rows, px.x, px.y, cols * cell, rows * cell);
      } else {
        // Overdraw by one cell so the soft edge doesn't fade toward the original pixels.
        ctx.drawImage(
          small,
          0,
          0,
          cols,
          rows,
          px.x - cell / 2,
          px.y - cell / 2,
          (cols + 1) * cell,
          (rows + 1) * cell,
        );
        // The soften pass is most of a blur's cost; a draft shows the upscaled cells alone.
        if (!draft && "filter" in ctx) {
          const soft = createCanvas(px.width, px.height);
          context2d(soft).drawImage(
            canvas,
            px.x,
            px.y,
            px.width,
            px.height,
            0,
            0,
            px.width,
            px.height,
          );
          ctx.filter = `blur(${Math.max(1, Math.round(cell / 2))}px)`;
          ctx.drawImage(soft, px.x, px.y);
          ctx.filter = "none";
        }
      }
      ctx.restore();
      return;
    }
    default: {
      const _exhaustive: never = redaction.style;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Step 3: frame composite

function paintBackground(ctx: Ctx, background: ExportBackground, size: ImageSize): void {
  switch (background.kind) {
    case "transparent":
      return;
    case "matte":
      ctx.fillStyle = MATTE;
      ctx.fillRect(0, 0, size.width, size.height);
      return;
    case "frame": {
      const parsed = parseCanvasBackground(background.css);
      if (parsed === null) {
        ctx.fillStyle = background.css;
      } else if (parsed.kind === "solid") {
        ctx.fillStyle = parsed.color;
      } else {
        const line = gradientLine(parsed.angle, size);
        const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1);
        for (const stop of parsed.stops) gradient.addColorStop(stop.offset, stop.color);
        ctx.fillStyle = gradient;
      }
      ctx.fillRect(0, 0, size.width, size.height);
      return;
    }
    default: {
      const _exhaustive: never = background;
      return _exhaustive;
    }
  }
}

/** Paints background, shadow and the rounded image onto `target` (already sized). */
export function compositeOutput(args: {
  target: AnyCanvas;
  image: AnyCanvas;
  layout: ImageLayout;
  background: ExportBackground;
}): void {
  const { target, image, layout, background } = args;
  const ctx = context2d(target);
  ctx.clearRect(0, 0, target.width, target.height);
  paintBackground(ctx, background, layout.output);

  if (layout.shadow !== null) {
    for (const layer of [layout.shadow.ambient, layout.shadow.contact]) {
      // Draw the casting shapes far off-canvas and offset only their shadow back into place, so
      // no fill color fringes the antialiased corners.
      const away = target.width + layer.blur * 4 + 10;
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${layer.opacity})`;
      ctx.shadowBlur = layer.blur;
      ctx.shadowOffsetX = away;
      ctx.shadowOffsetY = layer.offsetY;
      ctx.fillStyle = BLACKOUT;
      for (const shape of layout.shadowShapes) {
        roundedPath(ctx, { ...shape.rect, x: shape.rect.x - away }, shape.radius);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  ctx.save();
  roundedPath(ctx, layout.content, layout.radius);
  ctx.clip();
  ctx.drawImage(image, layout.content.x, layout.content.y);
  if (layout.hairline > 0) {
    // Inside the clip only half the stroke shows: a light rim that lifts dark screenshots off
    // dark backdrops, like a window edge.
    ctx.lineWidth = layout.hairline * 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Export

async function canvasToBlob(
  canvas: AnyCanvas,
  type: ImageExportFormat,
  quality: number | undefined,
): Promise<Blob> {
  if (isPageCanvas(canvas)) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob === null) throw new Error("The browser could not encode the image.");
    return blob;
  }
  return canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
}

/** The layout for `state`, with the composition grown to hold its image layers. */
export function layoutForState(args: {
  sourceSize: ImageSize;
  state: Pick<ImageDocumentState, "crop" | "rotation" | "flipX" | "annotations" | "frame">;
  scale?: number;
}): ImageLayout {
  const { state } = args;
  return computeImageLayout({
    source: args.sourceSize,
    geometry: state,
    frame: state.frame,
    bounds: imageCompositionBounds(state.annotations, state),
    pieces: compositionPieces(state.annotations, state),
    ...(args.scale === undefined ? {} : { scale: args.scale }),
  });
}

function renderAtScale(args: {
  source: CanvasImageSource;
  sourceSize: ImageSize;
  state: ImageDocumentState;
  layers: LayerSources;
  format: ImageExportFormat;
  scale: number;
}): AnyCanvas {
  const { state } = args;
  const layout = layoutForState({ sourceSize: args.sourceSize, state, scale: args.scale });
  const image = renderImageCanvas({
    source: args.source,
    sourceSize: args.sourceSize,
    geometry: state,
    redactions: state.redactions,
    annotations: state.annotations,
    layers: args.layers,
    layout,
  });
  const background = resolveExportBackground({
    frame: state.frame,
    transparent: state.transparent,
    format: args.format,
  });
  const target = createCanvas(layout.output.width, layout.output.height);
  compositeOutput({ target, image, layout, background });
  return target;
}

/**
 * Renders the result at full resolution and encodes it. If the browser refuses a canvas that
 * large (iOS caps canvas area), it retries at the largest size it will allocate.
 */
export async function exportImageBlob(args: {
  source: CanvasImageSource;
  sourceSize: ImageSize;
  state: ImageDocumentState;
  layers: LayerSources;
  format: ImageExportFormat;
}): Promise<Blob> {
  const { quality } = exportFormatInfo(args.format);
  try {
    return await canvasToBlob(renderAtScale({ ...args, scale: 1 }), args.format, quality);
  } catch (cause) {
    const full = layoutForState({ sourceSize: args.sourceSize, state: args.state });
    const scale = scaleToFitArea(full.output, SAFE_CANVAS_PIXELS);
    if (scale >= 1) throw cause;
    return canvasToBlob(renderAtScale({ ...args, scale }), args.format, quality);
  }
}

/**
 * The result drawn small, for the recent-projects thumbnail: the same pipeline as the export at
 * a scale that brings its longest side down to about `edge` pixels. Draws synchronously, so it
 * can run while the editor's bitmaps are still open.
 */
export function renderThumbnailCanvas(args: {
  source: CanvasImageSource;
  sourceSize: ImageSize;
  state: ImageDocumentState;
  layers: LayerSources;
  edge: number;
}): AnyCanvas {
  const full = layoutForState({ sourceSize: args.sourceSize, state: args.state });
  const longest = Math.max(full.output.width, full.output.height);
  const scale = longest > args.edge ? args.edge / longest : 1;
  // WebP keeps transparency, so a transparent export shows as one in the thumbnail too.
  return renderAtScale({ ...args, format: "image/webp", scale });
}
