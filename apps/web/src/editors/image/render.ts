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
  redactionCellSize,
  resolveExportBackground,
  SAFE_CANVAS_PIXELS,
  scaleToFitArea,
  sourceRectToView,
  textAnnotationBox,
  type ExportBackground,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageExportFormat,
  type ImageLayout,
  type ImageSize,
  type NormalizedPoint,
  type NormalizedRect,
  type PixelRect,
  type RedactionBox,
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

export function context2d(canvas: AnyCanvas): Ctx {
  // Both canvas types return their own 2D context type for "2d"; narrow by canvas type.
  const ctx =
    canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : canvas.getContext("2d");
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
};

/** Applies the redactions to the canvas, limited to `within` (view space) when given. */
function applyRedactions(
  ctx: Ctx,
  canvas: AnyCanvas,
  pass: RedactionPass,
  within: NormalizedRect | null,
): void {
  const base = baseRectInContent(pass.layout);
  const k = base.width / pass.layout.cropPixels.width;
  // Cell size follows the full image's long edge at this render's scale, so a preview and
  // the export blur and pixelate alike.
  const scaledLongEdge = Math.max(pass.sourceSize.width, pass.sourceSize.height) * k;
  const unit = { x: 0, y: 0, width: 1, height: 1 };
  for (const redaction of pass.redactions) {
    const onImage = intersectRects(sourceRectToView(redaction.rect, pass.geometry), unit);
    const view = onImage === null || within === null ? onImage : intersectRects(onImage, within);
    if (view === null) continue;
    const covered = coverPixels(view, { width: base.width, height: base.height });
    const px = { ...covered, x: covered.x + base.x, y: covered.y + base.y };
    if (px.width <= 0 || px.height <= 0) continue;
    applyRedaction({
      ctx,
      canvas,
      px,
      redaction,
      cell: redactionCellSize({ intensity: redaction.intensity, imageLongEdge: scaledLongEdge }),
    });
  }
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

  const pass: RedactionPass = { redactions: args.redactions, geometry, layout, sourceSize };
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
        { redactions: args.redactions, geometry, layout, sourceSize },
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

function applyRedaction(args: {
  ctx: Ctx;
  canvas: AnyCanvas;
  px: PixelRect;
  redaction: RedactionBox;
  cell: number;
}): void {
  const { ctx, canvas, px, redaction, cell } = args;
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
        if ("filter" in ctx) {
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
  if (canvas instanceof HTMLCanvasElement) {
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
