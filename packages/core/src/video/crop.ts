/**
 * Video crop geometry. Crops are stored as normalized rects (0..1 of the source frame); these
 * helpers apply aspect presets, resize from drag handles and convert to even pixel rects for
 * encoding. Pure; no DOM.
 */
import { clamp, clampNormalizedRect, FULL_RECT, isFullRect } from "../operations";
import type { NormalizedRect, VideoCropAspect, VideoDocumentState } from "../types";

export const VIDEO_CROP_ASPECTS: readonly VideoCropAspect[] = [
  "free",
  "16:9",
  "9:16",
  "1:1",
  "4:5",
];

/** Pixel size of the source frame (display size, after rotation metadata). */
export type FrameSize = {
  readonly width: number;
  readonly height: number;
};

/** Integer pixel crop, ready for an encoder. Width and height are even. */
export type PixelCrop = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Width over height for a preset; null for free. */
export function cropAspectRatio(aspect: VideoCropAspect): number | null {
  switch (aspect) {
    case "free":
      return null;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    default: {
      const _exhaustive: never = aspect;
      return _exhaustive;
    }
  }
}

type PxRect = { x: number; y: number; w: number; h: number };

function toPx(rect: NormalizedRect, frame: FrameSize): PxRect {
  return {
    x: rect.x * frame.width,
    y: rect.y * frame.height,
    w: rect.width * frame.width,
    h: rect.height * frame.height,
  };
}

function fromPx(r: PxRect, frame: FrameSize): NormalizedRect {
  return {
    x: r.x / frame.width,
    y: r.y / frame.height,
    width: r.w / frame.width,
    height: r.h / frame.height,
  };
}

/** Smallest crop edge in pixels while dragging. */
function minEdge(frame: FrameSize): number {
  return Math.max(8, Math.min(frame.width, frame.height) * 0.04);
}

function isValidFrame(frame: FrameSize): boolean {
  return frame.width > 0 && frame.height > 0;
}

/**
 * The largest rect with the preset's aspect that fits the frame, centered where the current
 * crop is centered. Free returns the crop unchanged.
 */
export function fitCropToAspect(args: {
  readonly rect: NormalizedRect;
  readonly aspect: VideoCropAspect;
  readonly frame: FrameSize;
}): NormalizedRect {
  const { rect, frame } = args;
  const ratio = cropAspectRatio(args.aspect);
  if (ratio === null || !isValidFrame(frame)) return rect;
  const r = toPx(rect, frame);
  const w = Math.min(frame.width, frame.height * ratio);
  const h = w / ratio;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return fromPx(
    {
      x: clamp(cx - w / 2, 0, frame.width - w),
      y: clamp(cy - h / 2, 0, frame.height - h),
      w,
      h,
    },
    frame,
  );
}

/**
 * Resizes or moves `rect` by a drag of (`dx`, `dy`) normalized units from where the drag started.
 * Aspect presets keep their ratio: corners anchor the opposite corner, edges keep the crop
 * centered on the other axis. The result always stays inside the frame.
 */
export function resizeCrop(args: {
  readonly rect: NormalizedRect;
  readonly handle: CropHandle;
  readonly dx: number;
  readonly dy: number;
  readonly aspect: VideoCropAspect;
  readonly frame: FrameSize;
}): NormalizedRect {
  const { frame, handle } = args;
  if (!isValidFrame(frame)) return args.rect;
  const r = toPx(args.rect, frame);
  const dx = args.dx * frame.width;
  const dy = args.dy * frame.height;
  const min = minEdge(frame);

  if (handle === "move") {
    return fromPx(
      {
        x: clamp(r.x + dx, 0, frame.width - r.w),
        y: clamp(r.y + dy, 0, frame.height - r.h),
        w: r.w,
        h: r.h,
      },
      frame,
    );
  }

  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const ratio = cropAspectRatio(args.aspect);

  if (ratio === null) {
    let left = r.x;
    let right = r.x + r.w;
    let top = r.y;
    let bottom = r.y + r.h;
    if (west) left = clamp(left + dx, 0, right - min);
    if (east) right = clamp(right + dx, left + min, frame.width);
    if (north) top = clamp(top + dy, 0, bottom - min);
    if (south) bottom = clamp(bottom + dy, top + min, frame.height);
    return fromPx({ x: left, y: top, w: right - left, h: bottom - top }, frame);
  }

  const minW = Math.max(min, min * ratio);
  if ((east || west) && (north || south)) {
    // Corner: anchor the opposite corner and follow whichever axis moved further.
    const anchorX = east ? r.x : r.x + r.w;
    const anchorY = south ? r.y : r.y + r.h;
    const fromX = r.w + (east ? dx : -dx);
    const fromY = (r.h + (south ? dy : -dy)) * ratio;
    const maxW = Math.min(
      east ? frame.width - anchorX : anchorX,
      (south ? frame.height - anchorY : anchorY) * ratio,
    );
    const w = clamp(Math.max(fromX, fromY), Math.min(minW, maxW), maxW);
    const h = w / ratio;
    return fromPx(
      { x: east ? anchorX : anchorX - w, y: south ? anchorY : anchorY - h, w, h },
      frame,
    );
  }

  if (north || south) {
    const anchorY = south ? r.y : r.y + r.h;
    const maxH = Math.min(south ? frame.height - anchorY : anchorY, frame.width / ratio);
    const h = clamp(r.h + (south ? dy : -dy), Math.min(minW / ratio, maxH), maxH);
    const w = h * ratio;
    const cx = r.x + r.w / 2;
    return fromPx(
      { x: clamp(cx - w / 2, 0, frame.width - w), y: south ? anchorY : anchorY - h, w, h },
      frame,
    );
  }

  const anchorX = east ? r.x : r.x + r.w;
  const maxW = Math.min(east ? frame.width - anchorX : anchorX, frame.height * ratio);
  const w = clamp(r.w + (east ? dx : -dx), Math.min(minW, maxW), maxW);
  const h = w / ratio;
  const cy = r.y + r.h / 2;
  return fromPx(
    { x: east ? anchorX : anchorX - w, y: clamp(cy - h / 2, 0, frame.height - h), w, h },
    frame,
  );
}

function floorEven(value: number): number {
  return Math.floor(value / 2) * 2;
}

/**
 * Converts a normalized crop to integer pixels with even offsets and sizes (4:2:0 codecs such
 * as H.264 and VP9 need even dimensions). The result stays inside the frame and is at least 2×2.
 */
export function cropToPixels(args: {
  readonly rect: NormalizedRect;
  readonly frame: FrameSize;
}): PixelCrop {
  const { frame } = args;
  const rect = clampNormalizedRect(args.rect);
  const maxW = Math.max(2, floorEven(frame.width));
  const maxH = Math.max(2, floorEven(frame.height));
  const left = clamp(floorEven(rect.x * frame.width), 0, maxW - 2);
  const top = clamp(floorEven(rect.y * frame.height), 0, maxH - 2);
  const width = clamp(floorEven(Math.round(rect.width * frame.width)), 2, maxW - left);
  const height = clamp(floorEven(Math.round(rect.height * frame.height)), 2, maxH - top);
  return { left, top, width, height };
}

/** The crop that export should apply, or null when the full frame is kept. */
export function getActiveCrop(state: VideoDocumentState): NormalizedRect | null {
  return state.cropEnabled && !isFullRect(state.crop) ? state.crop : null;
}

/** Toggles crop. Turning it on with a full-frame crop applies the current aspect preset. */
export function toggleVideoCrop(args: {
  readonly state: VideoDocumentState;
  readonly frame: FrameSize;
}): VideoDocumentState {
  const { state } = args;
  if (state.cropEnabled) return { ...state, cropEnabled: false, tool: "none" };
  const crop = isFullRect(state.crop)
    ? fitCropToAspect({ rect: FULL_RECT, aspect: state.cropAspect, frame: args.frame })
    : state.crop;
  return { ...state, cropEnabled: true, crop, tool: "crop" };
}

export function setVideoCropAspect(args: {
  readonly state: VideoDocumentState;
  readonly aspect: VideoCropAspect;
  readonly frame: FrameSize;
}): VideoDocumentState {
  const { state, aspect } = args;
  return {
    ...state,
    cropAspect: aspect,
    cropEnabled: true,
    tool: "crop",
    crop: fitCropToAspect({ rect: state.crop, aspect, frame: args.frame }),
  };
}
