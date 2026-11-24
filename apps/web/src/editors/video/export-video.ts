/**
 * Runs a core `VideoExportPlan` with mediabunny. A trim whose in point lands on a keyframe copies
 * the encoded packets (fast, lossless); everything else decodes, turns, flips, crops, retimes
 * each kept range onto the output timeline at its own speed, rewrites the audio with each range's
 * gain or mute and the output fades, and re-encodes. Codec and copy decisions come from
 * `@edit-here/core`.
 */
import {
  audioEncodeUnsupportedMessage,
  audioNeedsProcessing,
  canCopyVideoCodec,
  chooseAudioExport,
  chooseVideoEncoder,
  computeAudioGainAt,
  findCopyStart,
  firstSupported,
  isCopyExact,
  mapIntervalToRanges,
  softClipSample,
  timeScaleChannel,
  videoEncodeCandidates,
  type AudioExportChoice,
  type ExportAudioCodec,
  type ExportRange,
  type ExportVideoCodec,
  type KeptRange,
  type VideoExportFormat,
  type VideoExportPlan,
} from "@edit-here/core";
import {
  ALL_FORMATS,
  AudioSample,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  Conversion,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  type ConversionAudioOptions,
  type ConversionVideoOptions,
  type EncodedPacket,
  type InputVideoTrack,
  type VideoCodec,
  type VideoSample,
} from "mediabunny";
import type { SourceAudioTrack } from "./probe";

export type ExportResult = {
  readonly blob: Blob;
  /** Human notes about tracks that were dropped, for a warning toast. */
  readonly warnings: readonly string[];
};

type ExportArgs = {
  readonly file: File;
  readonly plan: Exclude<VideoExportPlan, { kind: "empty" }>;
  readonly sourceCodec: VideoCodec | null;
  readonly sourceAudio: SourceAudioTrack;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly onProgress: (fraction: number) => void;
};

type Trim = { readonly start: number; readonly end: number };

type Plan = ExportArgs["plan"];

/**
 * How decoded media maps onto the output: the kept ranges (each with its own speed, volume and
 * mute) and the trim start the conversion's own timeline begins at (its sample timestamps are
 * relative to it).
 */
type Retime = {
  readonly ranges: readonly ExportRange[];
  readonly trimStart: number;
};

function outputSize(args: ExportArgs): { width: number; height: number } {
  return args.plan.kind === "reencode"
    ? { width: args.plan.outputWidth, height: args.plan.outputHeight }
    : { width: args.width, height: args.height };
}

/**
 * The codec `chooseVideoEncoder` would pick, as a set: candidates are asked in preference order
 * and the first that works wins, so later ones (each a slow browser check) are never asked.
 */
async function encodableVideoCodecs(args: ExportArgs): Promise<ReadonlySet<ExportVideoCodec>> {
  const size = outputSize(args);
  const first = await firstSupported(videoEncodeCandidates(args.plan.format), (codec) =>
    canEncodeVideo(codec, size),
  );
  return new Set(first === null ? [] : [first]);
}

async function encodableAudioCodecs(): Promise<ReadonlySet<ExportAudioCodec>> {
  const candidates: readonly ExportAudioCodec[] = ["aac", "opus"];
  const supported = await Promise.all(candidates.map((codec) => canEncodeAudio(codec)));
  return new Set(candidates.filter((_, index) => supported[index] === true));
}

/** Timestamps of the keyframe at or before `time` and the one after it. */
async function keyframesAround(track: InputVideoTrack, time: number): Promise<number[]> {
  const sink = new EncodedPacketSink(track);
  const options = { verifyKeyPackets: true };
  const atOrBefore = await sink.getKeyPacket(time, options);
  const next =
    atOrBefore === null
      ? await sink.getFirstKeyPacket(options)
      : await sink.getNextKeyPacket(atOrBefore, options);
  return [atOrBefore, next]
    .filter((packet): packet is EncodedPacket => packet !== null)
    .map((packet) => packet.timestamp);
}

/** First and end timestamps of the video track in an exported file. */
async function videoSpan(buffer: ArrayBuffer): Promise<{ start: number; end: number } | null> {
  const input = new Input({ source: new BlobSource(new Blob([buffer])), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (track === null) return null;
    const [start, end] = await Promise.all([track.getFirstTimestamp(), track.computeDuration()]);
    return { start, end };
  } finally {
    input.dispose();
  }
}

/**
 * Retimes decoded frames onto the concatenated timeline, each range at its own speed.
 * `trimStart` undoes the offset the conversion applies (its timeline starts at the trim start),
 * giving back source time. Turn, flip and crop already ran; mediabunny calls this after its
 * transforms.
 */
function retimeVideo({ ranges, trimStart }: Retime) {
  return (sample: VideoSample): VideoSample | VideoSample[] | null => {
    const pieces = mapIntervalToRanges({
      ranges,
      start: sample.timestamp + trimStart,
      duration: sample.duration,
    });
    if (pieces.length === 0) return null;
    // The first piece reuses the input sample; mediabunny closes it and every clone we return.
    return pieces.map((piece, index) => {
      const out = index === 0 ? sample : sample.clone();
      out.setTimestamp(piece.outputStart);
      out.setDuration(Math.max(0, piece.sourceEnd - piece.sourceStart) / piece.range.speed);
      return out;
    });
  };
}

/**
 * Cuts audio at range edges, moves the kept parts onto the concatenated timeline, plays each at
 * its range's speed (resampled, so pitch follows like the preview) and applies that range's
 * volume, the output fades and a soft clip. A muted range becomes silence of the right length, so
 * the track keeps its timing around it. Emits new float32 planar samples; mediabunny closes the
 * input and every sample returned.
 */
function processAudio(retime: Retime, gain: Pick<Plan, "outputDuration" | "fadeIn" | "fadeOut">) {
  const { ranges, trimStart } = retime;
  return (sample: AudioSample): AudioSample[] | null => {
    const sourceStart = sample.timestamp + trimStart;
    const { sampleRate, numberOfChannels } = sample;
    const pieces = mapIntervalToRanges({ ranges, start: sourceStart, duration: sample.duration });
    const out: AudioSample[] = [];
    for (const piece of pieces) {
      const { speed, volume, muted } = piece.range;
      const startFrame = Math.max(0, Math.round((piece.sourceStart - sourceStart) * sampleRate));
      const endFrame = Math.min(
        sample.numberOfFrames,
        Math.round((piece.sourceEnd - sourceStart) * sampleRate),
      );
      const frameCount = endFrame - startFrame;
      if (frameCount <= 0) continue;
      const channels: Float32Array[] = [];
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const plane = new Float32Array(frameCount);
        sample.copyTo(plane, {
          planeIndex: channel,
          format: "f32-planar",
          frameOffset: startFrame,
          frameCount,
        });
        channels.push(speed === 1 ? plane : timeScaleChannel(plane, speed));
      }
      const frames = channels[0]?.length ?? 0;
      if (frames === 0) continue;
      const timestamp = piece.outputStart;
      // Zero-filled: a muted range stays silent without touching the decoded samples.
      const data = new Float32Array(frames * numberOfChannels);
      if (muted) {
        out.push(
          new AudioSample({ data, format: "f32-planar", numberOfChannels, sampleRate, timestamp }),
        );
        continue;
      }
      for (let frame = 0; frame < frames; frame++) {
        const level = computeAudioGainAt({
          outputTime: timestamp + frame / sampleRate,
          outputDuration: gain.outputDuration,
          volume,
          muted: false,
          fadeIn: gain.fadeIn,
          fadeOut: gain.fadeOut,
        });
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const value = channels[channel]?.[frame] ?? 0;
          data[channel * frames + frame] = softClipSample(value * level);
        }
      }
      out.push(
        new AudioSample({ data, format: "f32-planar", numberOfChannels, sampleRate, timestamp }),
      );
    }
    return out.length === 0 ? null : out;
  };
}

function describeDiscard(reason: string, type: string): string {
  switch (reason) {
    case "undecodable_source_codec":
      return `The ${type} track uses a codec this browser can't decode, so it was left out.`;
    case "no_encodable_target_codec":
      return `This browser can't encode ${type} for this format, so the ${type} track was left out.`;
    default:
      return `The ${type} track was left out (${reason.replaceAll("_", " ")}).`;
  }
}

function audioOptions(args: {
  readonly choice: Exclude<AudioExportChoice, { kind: "unsupported" }>;
  readonly plan: Plan;
  /** Set when samples must be cut, retimed or regained; null to encode them as decoded. */
  readonly retime: Retime | null;
}): ConversionAudioOptions {
  const { choice, retime, plan } = args;
  switch (choice.kind) {
    case "none":
    case "drop":
      return { discard: true };
    case "copy":
      // Pin AAC in MP4 so mediabunny never falls back to another codec if it can't copy.
      return plan.format === "mp4" ? { codec: "aac" } : {};
    case "encode":
      return {
        codec: choice.codec,
        forceTranscode: true,
        ...(retime === null ? {} : { process: processAudio(retime, plan) }),
      };
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}

type Converted = {
  readonly buffer: ArrayBuffer;
  readonly mimeType: string;
  readonly warnings: string[];
};

async function convert(args: {
  readonly input: Input;
  readonly format: VideoExportFormat;
  readonly trim: Trim;
  readonly video: ConversionVideoOptions;
  readonly audio: ConversionAudioOptions;
  readonly onProgress: (fraction: number) => void;
}): Promise<Converted> {
  const output = new Output({
    format:
      args.format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input: args.input,
    output,
    tracks: "primary",
    trim: args.trim,
    video: args.video,
    audio: args.audio,
    showWarnings: false,
  });
  const videoDiscarded = conversion.discardedTracks.find((d) => d.track.isVideoTrack());
  if (!conversion.isValid || videoDiscarded !== undefined) {
    const reason = videoDiscarded?.reason ?? conversion.discardedTracks[0]?.reason ?? "unknown";
    throw new Error(describeDiscard(reason, "video"));
  }
  const audioDiscards = conversion.discardedTracks.filter(
    (d) => d.track.isAudioTrack() && d.reason !== "discarded_by_user",
  );
  if (audioDiscards.some((d) => d.reason === "no_encodable_target_codec")) {
    // Never ship a silent file, or a codec the container's players reject, without asking.
    throw new Error(audioEncodeUnsupportedMessage(args.format));
  }
  conversion.onProgress = (progress) => args.onProgress(Math.min(1, Math.max(0, progress)));
  await conversion.execute();
  const buffer = output.target.buffer;
  if (buffer === null) throw new Error("The encoder produced no data.");
  return {
    buffer,
    mimeType: await output.getMimeType(),
    warnings: audioDiscards.map((d) => describeDiscard(d.reason, "audio")),
  };
}

/**
 * Copies the trimmed packets when the in point lands on a keyframe and the result matches the
 * selection within a frame. Returns `null` when the trim has to be re-encoded.
 */
async function tryCopyTrim(args: {
  readonly input: Input;
  readonly exportArgs: ExportArgs;
  readonly range: KeptRange;
  readonly audio: ConversionAudioOptions;
}): Promise<Converted | null> {
  const { exportArgs, range } = args;
  const { format } = exportArgs.plan;
  const sourceCodec = exportArgs.sourceCodec;
  if (sourceCodec === null || !canCopyVideoCodec({ format, sourceCodec })) return null;
  const track = await args.input.getPrimaryVideoTrack();
  if (track === null) return null;
  const start = findCopyStart({
    start: range.start,
    frameRate: exportArgs.frameRate,
    keyframes: await keyframesAround(track, range.start),
  });
  if (start === null) return null;
  const copied = await convert({
    input: args.input,
    format,
    trim: { start, end: range.end },
    // Same codec as the source and no transforms, so mediabunny copies the packets.
    video: { codec: sourceCodec },
    audio: args.audio,
    onProgress: exportArgs.onProgress,
  });
  const span = await videoSpan(copied.buffer);
  const exact =
    span !== null &&
    isCopyExact({
      expectedDuration: range.end - range.start,
      frameRate: exportArgs.frameRate,
      output: span,
    });
  return exact ? copied : null;
}

/**
 * Decodes, turns, flips, crops and retimes onto the kept timeline, then encodes with the first
 * usable codec. mediabunny applies the turn, then the flip, then the crop, matching the editor's
 * crop, which is drawn on the turned and flipped frame.
 */
async function reencode(args: {
  readonly input: Input;
  readonly exportArgs: ExportArgs;
  readonly trim: Trim;
  /** Set when frames must move: several ranges or a speed change. */
  readonly retime: Retime | null;
  readonly audio: ConversionAudioOptions;
}): Promise<Converted> {
  const { plan } = args.exportArgs;
  const encoder = chooseVideoEncoder({
    format: plan.format,
    encodable: await encodableVideoCodecs(args.exportArgs),
  });
  if (encoder.kind === "unsupported") throw new Error(encoder.message);
  const { retime } = args;
  return convert({
    input: args.input,
    format: plan.format,
    trim: args.trim,
    video: {
      codec: encoder.codec,
      forceTranscode: true,
      quality: QUALITY_HIGH,
      rotate: plan.rotation,
      flip: plan.flipX,
      // Bake the turn and flip into the pixels so the crop lands the same in every player.
      allowTransformationMetadata: false,
      ...(plan.kind === "reencode" && plan.crop !== null ? { crop: plan.crop } : {}),
      ...(retime === null ? {} : { process: retimeVideo(retime) }),
    },
    audio: args.audio,
    onProgress: args.exportArgs.onProgress,
  });
}

export async function exportVideo(args: ExportArgs): Promise<ExportResult> {
  const { plan } = args;
  const ranges: readonly ExportRange[] = plan.kind === "trim" ? [plan.range] : plan.ranges;
  const first = ranges[0];
  const last = ranges.at(-1);
  if (first === undefined || last === undefined) throw new Error("Nothing to export.");
  const trim: Trim = { start: first.start, end: last.end };
  const retime: Retime = { ranges, trimStart: trim.start };
  const framesMove = ranges.length > 1 || ranges.some((r) => r.speed !== 1);
  const audioRanges = { ranges, fadeIn: plan.fadeIn, fadeOut: plan.fadeOut };
  const samplesChange = audioNeedsProcessing(audioRanges);

  const audioChoice = chooseAudioExport({
    ...audioRanges,
    format: plan.format,
    source: args.sourceAudio,
    encodable: await encodableAudioCodecs(),
  });
  if (audioChoice.kind === "unsupported") throw new Error(audioChoice.message);
  const audio = audioOptions({
    choice: audioChoice,
    plan,
    retime: samplesChange ? retime : null,
  });
  const audioWarnings = audioChoice.kind === "drop" ? [audioChoice.warning] : [];

  const input = new Input({ source: new BlobSource(args.file), formats: ALL_FORMATS });
  try {
    const copied =
      plan.kind === "trim"
        ? await tryCopyTrim({ input, exportArgs: args, range: plan.range, audio })
        : null;
    const result =
      copied ??
      (await reencode({
        input,
        exportArgs: args,
        trim,
        retime: framesMove ? retime : null,
        audio,
      }));
    return {
      blob: new Blob([result.buffer], { type: result.mimeType }),
      warnings: [...audioWarnings, ...result.warnings],
    };
  } finally {
    input.dispose();
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start the download before the URL goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
