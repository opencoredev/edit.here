/**
 * Codec and copy-path decisions for video export. Pure: the web editor asks the browser what it
 * can encode and reads keyframes from the file, then lets these functions decide.
 */
import type { VideoExportFormat } from "../types";
import type { ExportRange } from "./timeline";

/** Video codecs the exporter encodes to, per container, in order of preference. */
export type ExportVideoCodec = "avc" | "vp9" | "vp8" | "av1";

/** Audio codec the exporter encodes to: AAC for MP4 (what QuickTime plays), Opus for WebM. */
export type ExportAudioCodec = "aac" | "opus";

const VIDEO_ENCODE_ORDER: Readonly<Record<VideoExportFormat, readonly ExportVideoCodec[]>> = {
  mp4: ["avc"],
  webm: ["vp9", "vp8", "av1"],
};

/** Source video codecs whose packets each container can take as they are. */
const COPYABLE_VIDEO: Readonly<Record<VideoExportFormat, ReadonlySet<string>>> = {
  mp4: new Set(["avc"]),
  webm: new Set(["vp9", "vp8", "av1"]),
};

/**
 * Source audio codecs whose packets each container can take as they are. MP4 only keeps AAC:
 * Opus or MP3 in MP4 is valid but QuickTime and many players won't play it.
 */
const COPYABLE_AUDIO: Readonly<Record<VideoExportFormat, ReadonlySet<string>>> = {
  mp4: new Set(["aac"]),
  webm: new Set(["opus", "vorbis"]),
};

const AUDIO_TARGET: Readonly<Record<VideoExportFormat, ExportAudioCodec>> = {
  mp4: "aac",
  webm: "opus",
};

const AUDIO_UNSUPPORTED: Readonly<Record<VideoExportFormat, string>> = {
  mp4: "This browser can't encode AAC audio for MP4. Export as WebM, or mute the audio (M).",
  webm: "This browser can't encode Opus audio for WebM. Export as MP4, or mute the audio (M).",
};

const VIDEO_UNSUPPORTED: Readonly<Record<VideoExportFormat, string>> = {
  mp4: "This browser can't encode H.264 video. Choose WebM and export again.",
  webm: "This browser can't encode WebM video. Choose MP4 and export again.",
};

/** The error shown when the browser can't encode the audio codec this container needs. */
export function audioEncodeUnsupportedMessage(format: VideoExportFormat): string {
  return AUDIO_UNSUPPORTED[format];
}

/** Codecs to ask the browser about before calling `chooseVideoEncoder`. */
export function videoEncodeCandidates(format: VideoExportFormat): readonly ExportVideoCodec[] {
  return VIDEO_ENCODE_ORDER[format];
}

/** Whether the source's video packets can go into this container without re-encoding. */
export function canCopyVideoCodec(args: {
  readonly format: VideoExportFormat;
  readonly sourceCodec: string | null;
}): boolean {
  return args.sourceCodec !== null && COPYABLE_VIDEO[args.format].has(args.sourceCodec);
}

export type VideoEncoderChoice =
  | { readonly kind: "encode"; readonly codec: ExportVideoCodec }
  | { readonly kind: "unsupported"; readonly message: string };

/** First codec the browser can encode for the container, in preference order. */
export function chooseVideoEncoder(args: {
  readonly format: VideoExportFormat;
  readonly encodable: ReadonlySet<ExportVideoCodec>;
}): VideoEncoderChoice {
  const codec = VIDEO_ENCODE_ORDER[args.format].find((candidate) => args.encodable.has(candidate));
  return codec === undefined
    ? { kind: "unsupported", message: VIDEO_UNSUPPORTED[args.format] }
    : { kind: "encode", codec };
}

/** What the source audio track looks like; `null` means the file has no audio. */
export type SourceAudio = {
  readonly codec: string | null;
  readonly decodable: boolean;
} | null;

export type AudioExportChoice =
  /** Every kept range is muted, or the file has no audio. */
  | { readonly kind: "none" }
  /** Copy the source's encoded packets. */
  | { readonly kind: "copy" }
  | { readonly kind: "encode"; readonly codec: ExportAudioCodec }
  /** Export without audio and tell the user why. */
  | { readonly kind: "drop"; readonly warning: string }
  /** Refuse the export; the message says what the user can do. */
  | { readonly kind: "unsupported"; readonly message: string };

/** The sound settings of one kept range, as `chooseAudioExport` reads them. */
export type AudioRange = Pick<ExportRange, "speed" | "volume" | "muted">;

/** Every kept range's audio, plus the fades on the whole output. */
export type AudioRanges = {
  readonly ranges: readonly AudioRange[];
  readonly fadeIn: number;
  readonly fadeOut: number;
};

/** Whether nothing in the export will be heard: no kept range, or every kept range muted. */
export function isAudioSilent(audio: Pick<AudioRanges, "ranges">): boolean {
  return audio.ranges.every((r) => r.muted);
}

/**
 * Whether the audio samples must be decoded and rewritten instead of copied: several ranges
 * (cut points or per-clip settings), any audible range with a volume or speed change, or a fade.
 */
export function audioNeedsProcessing(audio: AudioRanges): boolean {
  if (audio.ranges.length > 1 || audio.fadeIn > 0 || audio.fadeOut > 0) return true;
  return audio.ranges.some((r) => !r.muted && (r.volume !== 1 || r.speed !== 1));
}

/**
 * Picks how the audio track is exported. No audio when the file has none or every kept range is
 * muted. MP4 audio is always AAC: copied when the source is AAC and `audioNeedsProcessing` is
 * false (one range, untouched speed and volume, no fades); else encoded. When the browser can't
 * encode the container's codec, the export is refused rather than written with a codec players
 * reject.
 */
export function chooseAudioExport(
  args: AudioRanges & {
    readonly format: VideoExportFormat;
    readonly source: SourceAudio;
    readonly encodable: ReadonlySet<ExportAudioCodec>;
  },
): AudioExportChoice {
  const { format, source } = args;
  if (source === null || isAudioSilent(args)) return { kind: "none" };
  const copyable = !audioNeedsProcessing(args);
  if (copyable && source.codec !== null && COPYABLE_AUDIO[format].has(source.codec)) {
    return { kind: "copy" };
  }
  if (!source.decodable) {
    return {
      kind: "drop",
      warning: "The audio track uses a codec this browser can't decode, so it was left out.",
    };
  }
  const target = AUDIO_TARGET[format];
  return args.encodable.has(target)
    ? { kind: "encode", codec: target }
    : { kind: "unsupported", message: AUDIO_UNSUPPORTED[format] };
}

/**
 * Where a packet-copy trim may start: the keyframe within half a frame of the in point, so the
 * copy begins on the selected frame. Returns `null` when no keyframe is that close; copying
 * would then pull in frames from before the in point, so the trim must re-encode.
 */
export function findCopyStart(args: {
  readonly start: number;
  readonly frameRate: number;
  /** Keyframe timestamps near the in point, in seconds (e.g. the one at or before, and the next). */
  readonly keyframes: readonly number[];
}): number | null {
  const tolerance = 0.5 / args.frameRate + 1e-6;
  let best: number | null = null;
  for (const keyframe of args.keyframes) {
    const distance = Math.abs(keyframe - args.start);
    if (distance > tolerance) continue;
    if (best === null || distance < Math.abs(best - args.start)) best = keyframe;
  }
  return best;
}

/**
 * Whether a packet-copy result matches the selection: the video starts at zero (within half a
 * frame) and ends within one frame of the selected duration. B-frames past the out point can
 * stretch a copy; a result that fails this check is re-encoded instead.
 */
export function isCopyExact(args: {
  readonly expectedDuration: number;
  readonly frameRate: number;
  /** First and end timestamps of the output's video track, in seconds. */
  readonly output: { readonly start: number; readonly end: number };
}): boolean {
  const frame = 1 / args.frameRate;
  const epsilon = 1e-6;
  return (
    Math.abs(args.output.start) <= frame / 2 + epsilon &&
    Math.abs(args.output.end - args.expectedDuration) <= frame + epsilon
  );
}

/**
 * The export format a newly opened video starts on. MP4 when this browser can write it: H.264
 * video and, for a file with audio, AAC. Otherwise WebM when that works (Chromium on Linux encodes
 * Opus but not AAC), so the first Export succeeds. MP4 stays selectable either way.
 */
export function defaultVideoExportFormat(args: {
  readonly hasAudio: boolean;
  readonly encodableAudio: ReadonlySet<ExportAudioCodec>;
  readonly encodableVideo: ReadonlySet<ExportVideoCodec>;
}): VideoExportFormat {
  const works = (format: VideoExportFormat): boolean =>
    VIDEO_ENCODE_ORDER[format].some((codec) => args.encodableVideo.has(codec)) &&
    (!args.hasAudio || args.encodableAudio.has(AUDIO_TARGET[format]));
  if (works("mp4")) return "mp4";
  return works("webm") ? "webm" : "mp4";
}
