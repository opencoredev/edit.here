/**
 * Image geometry in normalized (0..1) space.
 *
 * Spaces:
 * - source: the decoded image as stored in the file.
 * - oriented: source mirrored horizontally (when `flipX`), then turned clockwise by
 *   `rotation`. This matches zriz's `quarterTurns` and `mirrored`. The crop lives here.
 * - view: the cropped region of the oriented image; what the user sees and exports.
 *
 * Redactions live in source space so they stay on the same pixels when the crop, rotation or
 * flip change.
 */
import { clamp, clampNormalizedRect, MIN_RECT_SIZE } from "../operations";
import type { ImageRotation, NormalizedRect } from "../types";

export type ImageSize = {
  readonly width: number;
  readonly height: number;
};

export type ImageOrientation = {
  readonly rotation: ImageRotation;
  readonly flipX: boolean;
};

export type ImageGeometry = ImageOrientation & {
  /** Crop in oriented space. */
  readonly crop: NormalizedRect;
};

export const IDENTITY_ORIENTATION: ImageOrientation = { rotation: 0, flipX: false };

export function orientedSize(size: ImageSize, rotation: ImageRotation): ImageSize {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

function mirrorRectX(rect: NormalizedRect): NormalizedRect {
  return { ...rect, x: 1 - rect.x - rect.width };
}

/** Turns a rect 90° clockwise inside the unit square. */
export function rotateRectCw(rect: NormalizedRect): NormalizedRect {
  return { x: 1 - rect.y - rect.height, y: rect.x, width: rect.height, height: rect.width };
}

function rotateRectBy(rect: NormalizedRect, rotation: ImageRotation): NormalizedRect {
  let out = rect;
  for (let turned = 0; turned < rotation; turned += 90) out = rotateRectCw(out);
  return out;
}

function inverseRotation(rotation: ImageRotation): ImageRotation {
  switch (rotation) {
    case 0:
      return 0;
    case 90:
      return 270;
    case 180:
      return 180;
    case 270:
      return 90;
    default: {
      const _exhaustive: never = rotation;
      return _exhaustive;
    }
  }
}

/** Source space → oriented space. */
export function orientRect(rect: NormalizedRect, orientation: ImageOrientation): NormalizedRect {
  const mirrored = orientation.flipX ? mirrorRectX(rect) : rect;
  return rotateRectBy(mirrored, orientation.rotation);
}

/** Oriented space → source space. */
export function unorientRect(rect: NormalizedRect, orientation: ImageOrientation): NormalizedRect {
  const unrotated = rotateRectBy(rect, inverseRotation(orientation.rotation));
  return orientation.flipX ? mirrorRectX(unrotated) : unrotated;
}

/** Source space → view space (may extend past 0..1 when the rect leaves the crop). */
export function sourceRectToView(rect: NormalizedRect, geometry: ImageGeometry): NormalizedRect {
  const oriented = orientRect(rect, geometry);
  const { crop } = geometry;
  return {
    x: (oriented.x - crop.x) / crop.width,
    y: (oriented.y - crop.y) / crop.height,
    width: oriented.width / crop.width,
    height: oriented.height / crop.height,
  };
}

/** View space → source space. */
export function viewRectToSource(rect: NormalizedRect, geometry: ImageGeometry): NormalizedRect {
  const { crop } = geometry;
  const oriented: NormalizedRect = {
    x: crop.x + rect.x * crop.width,
    y: crop.y + rect.y * crop.height,
    width: rect.width * crop.width,
    height: rect.height * crop.height,
  };
  return unorientRect(oriented, geometry);
}

/** Intersection of two rects, or null when they don't overlap. */
export function intersectRects(a: NormalizedRect, b: NormalizedRect): NormalizedRect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Turns the image 90° clockwise as the user sees it; the crop turns with it. */
export function rotateGeometryCw<T extends ImageGeometry>(geometry: T): T {
  const next: Record<ImageRotation, ImageRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };
  return { ...geometry, rotation: next[geometry.rotation], crop: rotateRectCw(geometry.crop) };
}

/**
 * Mirrors the image left-to-right as the user sees it, whatever the current rotation. A visible
 * mirror after a turn equals the opposite turn of the mirrored source.
 */
export function flipGeometryX<T extends ImageGeometry>(geometry: T): T {
  return {
    ...geometry,
    flipX: !geometry.flipX,
    rotation: inverseRotation(geometry.rotation),
    crop: mirrorRectX(geometry.crop),
  };
}

// ---------------------------------------------------------------------------
// Rect editing (redaction boxes and keyboard nudges, all in view space)

export type RectHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const RECT_HANDLES: readonly Exclude<RectHandle, "move">[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

/** The rect spanned by two points, clamped to `within` (the unit square unless given). */
export function rectFromPoints(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  /** The area the rect is kept inside; the base image (unit square) by default. */
  within: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 },
): NormalizedRect {
  const right = within.x + within.width;
  const bottom = within.y + within.height;
  const x0 = clamp(Math.min(a.x, b.x), within.x, right);
  const y0 = clamp(Math.min(a.y, b.y), within.y, bottom);
  const x1 = clamp(Math.max(a.x, b.x), within.x, right);
  const y1 = clamp(Math.max(a.y, b.y), within.y, bottom);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * Applies a drag of (dx, dy) to `rect` through `handle`. Moves keep the size and stay inside
 * the unit square; edge drags stop at the opposite edge minus `minSize`.
 */
export function dragRect(args: {
  readonly rect: NormalizedRect;
  readonly handle: RectHandle;
  readonly dx: number;
  readonly dy: number;
  readonly minSize?: number;
}): NormalizedRect {
  const { rect, handle, dx, dy } = args;
  const min = args.minSize ?? MIN_RECT_SIZE;
  if (handle === "move") {
    return {
      ...rect,
      x: clamp(rect.x + dx, 0, 1 - rect.width),
      y: clamp(rect.y + dy, 0, 1 - rect.height),
    };
  }
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.width;
  let y1 = rect.y + rect.height;
  if (handle.includes("w")) x0 = clamp(x0 + dx, 0, x1 - min);
  if (handle.includes("e")) x1 = clamp(x1 + dx, x0 + min, 1);
  if (handle.includes("n")) y0 = clamp(y0 + dy, 0, y1 - min);
  if (handle.includes("s")) y1 = clamp(y1 + dy, y0 + min, 1);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** True when a dragged-out rect is big enough to keep (in view pixels). */
export function isUsableDraw(args: {
  readonly rect: NormalizedRect;
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly minPixels?: number;
}): boolean {
  const min = args.minPixels ?? 4;
  return args.rect.width * args.viewWidth >= min && args.rect.height * args.viewHeight >= min;
}

/** Moves a crop by whole oriented-image pixels, keeping it inside the image. */
export function nudgeCrop(args: {
  readonly crop: NormalizedRect;
  readonly oriented: ImageSize;
  readonly dxPixels: number;
  readonly dyPixels: number;
}): NormalizedRect {
  const { crop, oriented } = args;
  return clampNormalizedRect({
    ...crop,
    x: clamp(crop.x + args.dxPixels / oriented.width, 0, 1 - crop.width),
    y: clamp(crop.y + args.dyPixels / oriented.height, 0, 1 - crop.height),
  });
}

/** Normalized crop ⇄ zriz-style center/size. */
export function cropToCenter(crop: NormalizedRect): {
  readonly center: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
} {
  return {
    center: { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 },
    size: { width: crop.width, height: crop.height },
  };
}

export function cropFromCenter(value: {
  readonly center: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
}): NormalizedRect {
  const width = Math.min(1, value.size.width);
  const height = Math.min(1, value.size.height);
  const rect = {
    x: value.center.x - width / 2,
    y: value.center.y - height / 2,
    width,
    height,
  };
  // Snap float dust so a full crop reads as exactly full.
  const snapped = {
    x: snap(rect.x),
    y: snap(rect.y),
    width: snap(rect.width),
    height: snap(rect.height),
  };
  return clampNormalizedRect(snapped);
}

function snap(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function sameRect(a: NormalizedRect, b: NormalizedRect, epsilon = 1e-6): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.height - b.height) <= epsilon
  );
}

/**
 * Canvas transform `[a, b, c, d, e, f]` that maps source pixels to oriented pixels, for
 * `ctx.transform(...)`. `size` is the source size in the units being drawn.
 */
export function orientationMatrix(
  orientation: ImageOrientation,
  size: ImageSize,
): readonly [number, number, number, number, number, number] {
  const { width: w, height: h } = size;
  // Mirror first: x → w − x.
  const flip = orientation.flipX ? -1 : 1;
  const flipE = orientation.flipX ? w : 0;
  switch (orientation.rotation) {
    case 0:
      return [flip, 0, 0, 1, flipE, 0];
    case 90:
      // (x, y) → (h − y, x)
      return [0, flip, -1, 0, h, flipE];
    case 180:
      // (x, y) → (w − x, h − y)
      return [-flip, 0, 0, -1, w - flipE, h];
    case 270:
      // (x, y) → (y, w − x)
      return [0, -flip, 1, 0, 0, w - flipE];
    default: {
      const _exhaustive: never = orientation.rotation;
      return _exhaustive;
    }
  }
}
