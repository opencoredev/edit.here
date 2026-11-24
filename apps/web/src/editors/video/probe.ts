/** Reads what the editor needs from a video file with mediabunny: duration, size, frame rate. */
import {
  defaultVideoExportFormat,
  normalizeFrameRate,
  type ExportAudioCodec,
  type ExportVideoCodec,
  type VideoExportFormat,
} from "@edit-here/core";
import {
  ALL_FORMATS,
  BlobSource,
  canEncodeAudio,
  canEncodeVideo,
  Input,
  type InputAudioTrack,
  type AudioCodec,
  type InputVideoTrack,
  type VideoCodec,
} from "mediabunny";

/** The primary audio track's codec and whether this browser decodes it; `null` without audio. */
export type SourceAudioTrack = {
  readonly codec: AudioCodec | null;
  readonly decodable: boolean;
} | null;

export type VideoProbe = {
  readonly input: Input<BlobSource>;
  readonly videoTrack: InputVideoTrack;
  /** Null when the file has no audio or the browser can't decode it. */
  readonly audioTrack: InputAudioTrack | null;
  /** The primary audio track's codec and decodability, even when it can't be decoded. */
  readonly sourceAudio: SourceAudioTrack;
  readonly duration: number;
  readonly frameRate: number;
  /** Display size in pixels (rotation metadata applied). */
  readonly width: number;
  readonly height: number;
  readonly videoCodec: VideoCodec | null;
  /** The format a fresh document starts on: one this browser can export (`defaultVideoExportFormat`). */
  readonly defaultExportFormat: VideoExportFormat;
};

const AUDIO_CODECS: readonly ExportAudioCodec[] = ["aac", "opus"];
const VIDEO_CODECS: readonly ExportVideoCodec[] = ["avc", "vp9", "vp8", "av1"];

async function supported<T>(
  codecs: readonly T[],
  check: (codec: T) => Promise<boolean>,
): Promise<ReadonlySet<T>> {
  const results = await Promise.all(codecs.map((codec) => check(codec).catch(() => false)));
  return new Set(codecs.filter((_, index) => results[index] === true));
}

export type ProbeResult =
  | { readonly kind: "ready"; readonly probe: VideoProbe }
  | { readonly kind: "unsupported"; readonly message: string };

const CODEC_NAMES: Readonly<Record<VideoCodec, string>> = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  prores: "ProRes",
};

function codecName(codec: VideoCodec | null): string {
  return codec === null ? "this" : CODEC_NAMES[codec];
}

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== "" ? cause.message : String(cause);
}

export async function probeVideo(file: File): Promise<ProbeResult> {
  // WebCodecs exists only in secure contexts, so on a plain-http address every codec looks
  // unsupported. Say what's actually wrong.
  if (typeof VideoDecoder === "undefined" && !window.isSecureContext) {
    return {
      kind: "unsupported",
      message: "Video editing needs a secure connection. Open edit.here over HTTPS.",
    };
  }
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) {
      input.dispose();
      return { kind: "unsupported", message: "This video container isn't supported." };
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack === null) {
      input.dispose();
      return { kind: "unsupported", message: "This file has no video track." };
    }
    const videoCodec = await videoTrack.getCodec();
    if (!(await videoTrack.canDecode())) {
      input.dispose();
      return {
        kind: "unsupported",
        message: `This browser can't decode ${codecName(videoCodec)} video.`,
      };
    }
    const audio = await input.getPrimaryAudioTrack();
    const sourceAudio: SourceAudioTrack =
      audio === null ? null : { codec: await audio.getCodec(), decodable: await audio.canDecode() };
    const audioTrack = audio !== null && sourceAudio?.decodable === true ? audio : null;
    const [duration, width, height, stats] = await Promise.all([
      input.computeDuration(),
      videoTrack.getDisplayWidth(),
      videoTrack.getDisplayHeight(),
      videoTrack.computePacketStats(120),
    ]);
    if (!Number.isFinite(duration) || duration <= 0) {
      input.dispose();
      return { kind: "unsupported", message: "This video has no playable frames." };
    }
    const [encodableAudio, encodableVideo] = await Promise.all([
      sourceAudio === null
        ? Promise.resolve(new Set<ExportAudioCodec>())
        : supported(AUDIO_CODECS, (codec) => canEncodeAudio(codec)),
      // Encoders want even sizes; the export rounds the same way.
      supported(VIDEO_CODECS, (codec) =>
        canEncodeVideo(codec, {
          width: Math.max(2, width - (width % 2)),
          height: Math.max(2, height - (height % 2)),
        }),
      ),
    ]);
    return {
      kind: "ready",
      probe: {
        input,
        videoTrack,
        audioTrack,
        sourceAudio,
        duration,
        frameRate: normalizeFrameRate(stats.averagePacketRate),
        width,
        height,
        videoCodec,
        defaultExportFormat: defaultVideoExportFormat({
          hasAudio: sourceAudio !== null,
          encodableAudio,
          encodableVideo,
        }),
      },
    };
  } catch (cause) {
    input.dispose();
    return { kind: "unsupported", message: `Couldn't read this video: ${messageOf(cause)}` };
  }
}
