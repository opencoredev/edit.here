/**
 * Keeps the stage canvas in step with the document while repainting as little as possible.
 *
 * A paint is a cached composition canvas (`under`) with some annotations drawn over it. Every
 * drawing happens on an offscreen work canvas, the same kind of canvas the export renders on,
 * and only the pixels that changed are copied to the display canvas. Two rules keep a partial
 * repaint exactly equal to a full one:
 *
 * - The pixels that can differ are the old and new footprint of the one annotation that was
 *   added or swapped, plus, with redactions present, the footprint of each picture above it,
 *   which redacts again whatever lies under it; everywhere else the old paint is already right.
 * - An annotation redrawn inside the region is never cut by it: the region grows until each
 *   annotation is wholly inside or wholly outside, because a clip through a path can change how
 *   its edges are antialiased.
 */
import {
  annotationChangeRegion,
  isImageLayer,
  planRedactionRepaint,
  unionPixelRects,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageLayout,
  type ImageSize,
  type PixelOffset,
  type PixelRect,
  type PixelRepaint,
  type RedactionBox,
  type RedactionFootprint,
} from "@edit-here/core";
import {
  annotationPaintRect,
  context2d,
  createCanvas,
  paintComposition,
  type AnyCanvas,
  type LayerSources,
} from "./render";

type DocGeometry = Pick<ImageDocumentState, "crop" | "rotation" | "flipX">;

/** What the stage shows: `shows`, of which all but the last `extras.length` are in `under`. */
export type StagePaint = {
  /** A composition canvas holding the base image, its redactions and the leading annotations. */
  readonly under: AnyCanvas;
  /**
   * Where `under`'s origin goes on this paint's composition: zero, or the base image's move
   * while a dragged layer grows the composition around a cache drawn before it did.
   */
  readonly underAt: PixelOffset;
  /** Drawn over `under`, in order; the tail of `shows`. */
  readonly extras: readonly ImageAnnotation[];
  /** Every annotation on screen, in paint order. */
  readonly shows: readonly ImageAnnotation[];
  readonly layout: ImageLayout;
  readonly geometry: DocGeometry;
  readonly sourceSize: ImageSize;
  readonly layers: LayerSources;
  readonly redactions: readonly RedactionBox[];
  /** `redactionFootprints` of `redactions` as `under` was redacted with them. */
  readonly redactionBoxes: readonly RedactionFootprint[];
  /**
   * `textFontGeneration()` when `under` was drawn. Text drawn before the text font loaded used
   * a fallback, so a paint of another generation shares no pixels with this one.
   */
  readonly fonts: number;
};

const FULL: PixelRepaint = { kind: "full" };
const NONE: PixelRepaint = { kind: "none" };

/** Whether two paints lay out the same image and drawings, so at most their redactions differ. */
function sameGeometry(a: StagePaint, b: StagePaint): boolean {
  return (
    a.layout === b.layout &&
    a.geometry === b.geometry &&
    a.sourceSize === b.sourceSize &&
    a.layers === b.layers &&
    a.fonts === b.fonts
  );
}

/**
 * Whether two paints draw their annotations onto the same base, so only annotations differ. The
 * same boxes can be drawn at draft and then exact quality, so their footprints are compared too.
 */
function sameScene(a: StagePaint, b: StagePaint): boolean {
  return (
    sameGeometry(a, b) && a.redactions === b.redactions && a.redactionBoxes === b.redactionBoxes
  );
}

function atOrigin(paint: StagePaint): boolean {
  return paint.underAt.x === 0 && paint.underAt.y === 0;
}

/**
 * The pixels that differ when only the redaction boxes changed: the ones the redaction repaint
 * plan restores and redoes. Drawings composite pixel by pixel over the redacted image, so they
 * change nothing outside it, except a picture, which is redacted again against every box.
 */
function redactionChange(previous: StagePaint, next: StagePaint): PixelRepaint {
  if (
    !sameGeometry(previous, next) ||
    previous.shows !== next.shows ||
    !atOrigin(previous) ||
    !atOrigin(next) ||
    next.shows.some(isImageLayer)
  ) {
    return FULL;
  }
  const plan = planRedactionRepaint({
    previous: previous.redactionBoxes,
    next: next.redactionBoxes,
  });
  switch (plan.kind) {
    case "none":
      return NONE;
    case "full":
      return FULL;
    case "partial": {
      const rect = plan.region.reduce<PixelRect | null>(
        (union, r) => unionPixelRects(union, r),
        null,
      );
      return rect === null ? NONE : { kind: "region", rect };
    }
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}

type Footprint = {
  readonly layout: ImageLayout;
  readonly geometry: DocGeometry;
  /** The paint's `fonts` when measured: text ink changes once the text font loads. */
  readonly fonts: number;
  readonly rect: PixelRect | null;
};

// Annotations are immutable, so each one's footprint holds until the layout changes or the text
// font finishes loading.
const footprints = new WeakMap<ImageAnnotation, Footprint>();

function footprint(annotation: ImageAnnotation, paint: StagePaint): PixelRect | null {
  const cached = footprints.get(annotation);
  if (
    cached !== undefined &&
    cached.layout === paint.layout &&
    cached.geometry === paint.geometry &&
    cached.fonts === paint.fonts
  ) {
    return cached.rect;
  }
  const rect = annotationPaintRect({
    annotation,
    geometry: paint.geometry,
    sourceSize: paint.sourceSize,
    layout: paint.layout,
  });
  footprints.set(annotation, {
    layout: paint.layout,
    geometry: paint.geometry,
    fonts: paint.fonts,
    rect,
  });
  return rect;
}

function intersects(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function contains(outer: PixelRect, inner: PixelRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * The pixels that differ between what `previous` and `next` render: the old and new footprint
 * of the one annotation that changed, and, with redactions present, every picture above it,
 * since a picture re-redacts what lies under it (see `annotationChangeRegion`). When the
 * redaction boxes changed instead, the pixels their repaint redoes (see `redactionChange`).
 */
function changedPixels(previous: StagePaint, next: StagePaint): PixelRepaint {
  if (!sameScene(previous, next)) return redactionChange(previous, next);
  return annotationChangeRegion({
    before: previous.shows,
    after: next.shows,
    footprint: (annotation) => footprint(annotation, next),
    redacted: next.redactions.length > 0,
  });
}

/**
 * Grows `rect` until no annotation drawn over the cache crosses its edge. A picture is redacted
 * again against what lies under it, so with redactions present a picture repaints everything.
 */
function closeOver(rect: PixelRect, paint: StagePaint): PixelRepaint {
  if (paint.redactions.length > 0 && paint.extras.some(isImageLayer)) return FULL;
  let region = rect;
  let grown = true;
  while (grown) {
    grown = false;
    for (const annotation of paint.extras) {
      const box = footprint(annotation, paint);
      if (box === null || !intersects(box, region) || contains(region, box)) continue;
      region = unionPixelRects(region, box) ?? region;
      grown = true;
    }
  }
  return { kind: "region", rect: region };
}

function copyPixels(target: HTMLCanvasElement, source: AnyCanvas, repaint: PixelRepaint): void {
  if (repaint.kind === "none") return;
  const r =
    repaint.kind === "region"
      ? repaint.rect
      : { x: 0, y: 0, width: target.width, height: target.height };
  const ctx = context2d(target);
  ctx.clearRect(r.x, r.y, r.width, r.height);
  ctx.drawImage(source, r.x, r.y, r.width, r.height, r.x, r.y, r.width, r.height);
}

/** How long the work canvas outlives the gesture that needed it. */
const RELEASE_AFTER_MS = 2000;

export type StagePainter = {
  /** Brings `display` to `next`, sizing it to the composition. */
  readonly paint: (display: HTMLCanvasElement, next: StagePaint) => void;
};

export function createStagePainter(): StagePainter {
  // Kept for a gesture and only grown during it, so a drag that resizes the composition on every
  // move doesn't allocate each time (except while a picture is redacted again; see below).
  let work: AnyCanvas | null = null;
  let release: ReturnType<typeof setTimeout> | null = null;
  /** What `work` holds, when it is current for some paint. */
  let workPaint: StagePaint | null = null;
  /** What the display canvas holds. */
  let shown: StagePaint | null = null;
  let shownOn: HTMLCanvasElement | null = null;

  return {
    paint(display, next) {
      const size = next.layout.content;
      const { width, height } = size;
      if (display !== shownOn || display.width !== width || display.height !== height) {
        if (display.width !== width) display.width = width;
        if (display.height !== height) display.height = height;
        shown = null;
        shownOn = display;
      }
      const toDisplay = shown === null ? FULL : changedPixels(shown, next);
      shown = next;
      if (toDisplay.kind === "none") return;
      const placed = next.underAt.x === 0 && next.underAt.y === 0;
      if (next.extras.length === 0 && placed) {
        copyPixels(display, next.under, toDisplay);
        // Nothing is drawn over the cache at rest. Keep the work canvas a little in case another
        // gesture follows, then let it go rather than hold a composition-sized buffer.
        release ??= setTimeout(() => {
          release = null;
          work = null;
          workPaint = null;
        }, RELEASE_AFTER_MS);
        return;
      }
      if (release !== null) {
        clearTimeout(release);
        release = null;
      }
      // A picture is redacted again by sampling the work canvas, and a downsample's result depends
      // on the whole canvas it reads (its mipmaps), not only on the pixels it covers. So with
      // that to do, the work canvas is exactly the composition, like the export's; otherwise it
      // only grows.
      const exact = next.redactions.length > 0 && next.extras.some(isImageLayer);
      if (
        work === null ||
        work.width < width ||
        work.height < height ||
        (exact && (work.width !== width || work.height !== height))
      ) {
        work = exact
          ? createCanvas(width, height)
          : createCanvas(Math.max(width, work?.width ?? 0), Math.max(height, work?.height ?? 0));
        workPaint = null;
      }
      const changed = workPaint === null ? FULL : changedPixels(workPaint, next);
      const onWork = changed.kind === "region" ? closeOver(changed.rect, next) : changed;
      if (onWork.kind !== "none") {
        paintComposition({
          ctx: context2d(work),
          canvas: work,
          size,
          under: next.under,
          underAt: next.underAt,
          region: onWork.kind === "region" ? onWork.rect : null,
          annotations: next.extras,
          geometry: next.geometry,
          sourceSize: next.sourceSize,
          layout: next.layout,
          layers: next.layers,
          redactions: next.redactions,
        });
      }
      workPaint = next;
      copyPixels(display, work, toDisplay);
    },
  };
}
