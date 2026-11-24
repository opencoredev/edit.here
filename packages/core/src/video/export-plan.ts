/** Decides how a video document is exported. Pure; the web editor runs the plan with mediabunny. */
import type { ImageRotation, VideoDocumentState, VideoExportFormat } from "../types";
import { clampVideoFade, orientedFrameSize } from "./adjust";
import { cropToPixels, getActiveCrop, type FrameSize, type PixelCrop } from "./crop";
import { getExportRanges, getRangesOutputDuration, type ExportRange } from "./timeline";

/** Settings every non-empty plan carries. Speed, volume and mute live on each range. */
export type VideoExportSettings = {
  /** Every kept range is muted, so the file has no audio track. */
  readonly muted: boolean;
  readonly format: VideoExportFormat;
  /** Length of the exported file in seconds (each range's length divided by its speed). */
  readonly outputDuration: number;
  readonly rotation: ImageRotation;
  readonly flipX: boolean;
  /** Fades on the whole output timeline, in seconds. */
  readonly fadeIn: number;
  readonly fadeOut: number;
};

export type VideoExportPlan =
  /** Nothing is kept; export must refuse. */
  | { readonly kind: "empty" }
  /**
   * One contiguous kept range at 1× and nothing that changes pixels or sound: trim the source
   * and copy encoded packets when the container allows it (the encoder only runs where it must).
   */
  | (VideoExportSettings & {
      readonly kind: "trim";
      readonly range: ExportRange;
    })
  /**
   * Several kept ranges, a crop, a turn, a flip, a speed change or audio changes: decode,
   * transform, retime each range onto the concatenated timeline at its own speed and re-encode.
   */
  | (VideoExportSettings & {
      readonly kind: "reencode";
      readonly ranges: readonly [ExportRange, ...ExportRange[]];
      /** Crop in the turned and flipped frame, or null for the whole frame. */
      readonly crop: PixelCrop | null;
      /** Encoded frame size: the crop, else the turned frame. */
      readonly outputWidth: number;
      readonly outputHeight: number;
    });

export function planVideoExport(args: {
  readonly state: VideoDocumentState;
  /** Source display size, before the document's turn. */
  readonly frame: FrameSize;
}): VideoExportPlan {
  const { state } = args;
  const [first, ...rest] = getExportRanges(state);
  if (first === undefined) return { kind: "empty" };
  const ranges: readonly [ExportRange, ...ExportRange[]] = [first, ...rest];
  const settings: VideoExportSettings = {
    muted: ranges.every((r) => r.muted),
    format: state.exportFormat,
    outputDuration: getRangesOutputDuration(ranges),
    rotation: state.rotation,
    flipX: state.flipX,
    fadeIn: clampVideoFade(state.fadeIn),
    fadeOut: clampVideoFade(state.fadeOut),
  };
  const frame = orientedFrameSize(args.frame, state.rotation);
  const activeCrop = getActiveCrop(state);
  const crop = activeCrop === null ? null : cropToPixels({ rect: activeCrop, frame });
  const coversFrame =
    crop !== null &&
    crop.left === 0 &&
    crop.top === 0 &&
    crop.width >= frame.width - 1 &&
    crop.height >= frame.height - 1;
  const effectiveCrop = coversFrame ? null : crop;
  const audioUnchanged =
    first.muted || (first.volume === 1 && settings.fadeIn === 0 && settings.fadeOut === 0);
  const copyable =
    rest.length === 0 &&
    effectiveCrop === null &&
    settings.rotation === 0 &&
    !settings.flipX &&
    first.speed === 1 &&
    audioUnchanged;
  if (copyable) return { ...settings, kind: "trim", range: first };
  return {
    ...settings,
    kind: "reencode",
    ranges,
    crop: effectiveCrop,
    outputWidth: effectiveCrop?.width ?? frame.width,
    outputHeight: effectiveCrop?.height ?? frame.height,
  };
}

/** Output file name: the source name without extension, an `-edit` suffix, the new extension. */
export function videoExportFileName(sourceName: string, format: VideoExportFormat): string {
  const dot = sourceName.lastIndexOf(".");
  const stem = (dot > 0 ? sourceName.slice(0, dot) : sourceName).trim() || "video";
  return `${stem}-edit.${format}`;
}
