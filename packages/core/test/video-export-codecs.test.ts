import { describe, expect, it } from "vitest";
import {
  audioEncodeUnsupportedMessage,
  canCopyVideoCodec,
  chooseAudioExport,
  chooseVideoEncoder,
  findCopyStart,
  isCopyExact,
  resolveVideoExportFormat,
  type AudioRanges,
  type ExportAudioCodec,
} from "../src/index";

const aac = { codec: "aac", decodable: true } as const;
const opus = { codec: "opus", decodable: true } as const;
const both: ReadonlySet<ExportAudioCodec> = new Set(["aac", "opus"]);
const opusOnly: ReadonlySet<ExportAudioCodec> = new Set(["opus"]);
const untouched = { speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 } as const;

type Adjust = { speed: number; volume: number; fadeIn: number; fadeOut: number };

/**
 * These cases predate per-clip settings: one document-wide mute and adjustment over one range
 * (`contiguous`) or two. They map onto the range-based arguments unchanged.
 */
function choose({
  muted,
  contiguous,
  adjust,
  ...rest
}: Omit<Parameters<typeof chooseAudioExport>[0], keyof AudioRanges | "keyHints"> & {
  readonly muted: boolean;
  readonly contiguous: boolean;
  readonly adjust: Adjust;
}) {
  const range = { speed: adjust.speed, volume: adjust.volume, muted };
  return chooseAudioExport({
    keyHints: true,
    ...rest,
    ranges: contiguous ? [range] : [range, range],
    fadeIn: adjust.fadeIn,
    fadeOut: adjust.fadeOut,
  });
}

describe("chooseAudioExport", () => {
  it("exports no audio when muted or when the file has none", () => {
    const base = { format: "mp4", contiguous: true, encodable: opusOnly } as const;
    expect(choose({ adjust: untouched, ...base, muted: true, source: aac })).toEqual({
      kind: "none",
    });
    expect(choose({ adjust: untouched, ...base, muted: false, source: null })).toEqual({
      kind: "none",
    });
  });

  it("copies AAC into MP4 on a single range, even without an AAC encoder", () => {
    expect(
      choose({
        adjust: untouched,
        format: "mp4",
        muted: false,
        source: aac,
        contiguous: true,
        encodable: new Set(),
      }),
    ).toEqual({ kind: "copy" });
  });

  it("encodes AAC for MP4 when the source can't be copied", () => {
    expect(
      choose({
        adjust: untouched,
        format: "mp4",
        muted: false,
        source: aac,
        contiguous: false,
        encodable: both,
      }),
    ).toEqual({ kind: "encode", codec: "aac" });
    // Opus source: never copied into MP4, re-encoded as AAC.
    expect(
      choose({
        adjust: untouched,
        format: "mp4",
        muted: false,
        source: opus,
        contiguous: true,
        encodable: both,
      }),
    ).toEqual({ kind: "encode", codec: "aac" });
  });

  it("refuses MP4 with audio when AAC can't be encoded instead of falling back to Opus", () => {
    const choice = choose({
      adjust: untouched,
      format: "mp4",
      muted: false,
      source: aac,
      contiguous: false,
      encodable: opusOnly,
    });
    expect(choice).toEqual({
      kind: "unsupported",
      message:
        "This browser can't encode AAC audio for MP4. Export as WebM, or mute the audio (M).",
    });
    expect(
      choose({
        adjust: untouched,
        format: "mp4",
        muted: false,
        source: { codec: "mp3", decodable: true },
        contiguous: true,
        encodable: opusOnly,
      }),
    ).toEqual(choice);
  });

  it("leaves the mute shortcut out of the refusal on touch and phone layouts", () => {
    const refusal = chooseAudioExport({
      format: "mp4",
      source: aac,
      encodable: opusOnly,
      ranges: [{ speed: 1, volume: 0.5, muted: false }],
      fadeIn: 0,
      fadeOut: 0,
      keyHints: false,
    });
    expect(refusal).toEqual({
      kind: "unsupported",
      message: "This browser can't encode AAC audio for MP4. Export as WebM, or mute the audio.",
    });
    expect(audioEncodeUnsupportedMessage({ format: "webm", keyHints: false })).not.toContain("(M)");
  });

  it("copies Opus or Vorbis into WebM and encodes Opus otherwise", () => {
    const base = { format: "webm", muted: false, encodable: opusOnly } as const;
    expect(choose({ adjust: untouched, ...base, source: opus, contiguous: true })).toEqual({
      kind: "copy",
    });
    expect(
      choose({
        adjust: untouched,
        ...base,
        source: { codec: "vorbis", decodable: true },
        contiguous: true,
      }),
    ).toEqual({ kind: "copy" });
    expect(choose({ adjust: untouched, ...base, source: aac, contiguous: true })).toEqual({
      kind: "encode",
      codec: "opus",
    });
    expect(
      choose({
        adjust: untouched,
        ...base,
        source: aac,
        contiguous: true,
        encodable: new Set(),
      }),
    ).toEqual({
      kind: "unsupported",
      message: audioEncodeUnsupportedMessage({ format: "webm", keyHints: true }),
    });
  });

  it("drops audio it can neither copy nor decode, with a warning", () => {
    const choice = choose({
      adjust: untouched,
      format: "mp4",
      muted: false,
      source: { codec: "ac3", decodable: false },
      contiguous: true,
      encodable: both,
    });
    expect(choice.kind).toBe("drop");
  });
});

describe("video codecs", () => {
  it("copies only codecs the container carries", () => {
    expect(canCopyVideoCodec({ format: "mp4", sourceCodec: "avc" })).toBe(true);
    expect(canCopyVideoCodec({ format: "mp4", sourceCodec: "vp9" })).toBe(false);
    expect(canCopyVideoCodec({ format: "webm", sourceCodec: "vp9" })).toBe(true);
    expect(canCopyVideoCodec({ format: "webm", sourceCodec: "avc" })).toBe(false);
    expect(canCopyVideoCodec({ format: "mp4", sourceCodec: null })).toBe(false);
  });

  it("picks the first encodable codec in preference order", () => {
    expect(chooseVideoEncoder({ format: "webm", encodable: new Set(["vp8", "av1"]) })).toEqual({
      kind: "encode",
      codec: "vp8",
    });
    expect(chooseVideoEncoder({ format: "mp4", encodable: new Set(["avc"]) })).toEqual({
      kind: "encode",
      codec: "avc",
    });
    expect(chooseVideoEncoder({ format: "mp4", encodable: new Set(["vp9"]) }).kind).toBe(
      "unsupported",
    );
  });
});

describe("findCopyStart", () => {
  const fps = 30;

  it("starts the copy on a keyframe at the in point", () => {
    expect(findCopyStart({ start: 2, frameRate: fps, keyframes: [2, 4] })).toBe(2);
  });

  it("snaps to a keyframe within half a frame on either side", () => {
    expect(findCopyStart({ start: 1.99, frameRate: fps, keyframes: [0, 2] })).toBe(2);
    expect(findCopyStart({ start: 2.01, frameRate: fps, keyframes: [2, 4] })).toBe(2);
  });

  it("refuses when the nearest keyframe is a frame or more away", () => {
    // Seconds 1 to 2 of a clip with keyframes every 2s: copying would start at 0.
    expect(findCopyStart({ start: 1, frameRate: fps, keyframes: [0, 2] })).toBeNull();
    expect(findCopyStart({ start: 2 + 1 / fps, frameRate: fps, keyframes: [2, 4] })).toBeNull();
    expect(findCopyStart({ start: 1, frameRate: fps, keyframes: [] })).toBeNull();
  });
});

describe("isCopyExact", () => {
  const fps = 30;

  it("accepts output that starts at zero and ends within a frame of the selection", () => {
    expect(isCopyExact({ expectedDuration: 2, frameRate: fps, output: { start: 0, end: 2 } })).toBe(
      true,
    );
    expect(
      isCopyExact({ expectedDuration: 2, frameRate: fps, output: { start: 0, end: 2 + 1 / fps } }),
    ).toBe(true);
  });

  it("rejects frames kept before the in point", () => {
    // The reviewed bug: a GOP from before the in point hidden behind negative timestamps.
    expect(
      isCopyExact({ expectedDuration: 1, frameRate: fps, output: { start: -1, end: 1 } }),
    ).toBe(false);
  });

  it("rejects output that runs past the out point by more than a frame", () => {
    expect(
      isCopyExact({ expectedDuration: 1, frameRate: fps, output: { start: 0, end: 1.1 } }),
    ).toBe(false);
    expect(
      isCopyExact({ expectedDuration: 1, frameRate: fps, output: { start: 0, end: 0.9 } }),
    ).toBe(false);
  });
});

describe("chooseAudioExport with audio adjustments", () => {
  const base = {
    format: "mp4",
    muted: false,
    source: aac,
    contiguous: true,
    encodable: both,
  } as const;

  it("copies only when speed, volume and fades are untouched", () => {
    expect(choose({ ...base, adjust: untouched })).toEqual({ kind: "copy" });
  });

  it.each([
    ["volume", { ...untouched, volume: 0.5 }],
    ["louder volume", { ...untouched, volume: 2 }],
    ["fade in", { ...untouched, fadeIn: 0.5 }],
    ["fade out", { ...untouched, fadeOut: 1 }],
    ["speed", { ...untouched, speed: 1.5 }],
  ])("re-encodes for a %s change", (_name, adjust) => {
    expect(choose({ ...base, adjust })).toEqual({ kind: "encode", codec: "aac" });
    expect(choose({ ...base, format: "webm", source: opus, adjust })).toEqual({
      kind: "encode",
      codec: "opus",
    });
  });

  it("still exports nothing when muted, whatever the adjustments", () => {
    expect(choose({ ...base, muted: true, adjust: { ...untouched, volume: 2 } })).toEqual({
      kind: "none",
    });
  });

  it("refuses when an adjustment needs an encoder the browser lacks", () => {
    expect(choose({ ...base, encodable: opusOnly, adjust: { ...untouched, fadeIn: 1 } })).toEqual({
      kind: "unsupported",
      message: audioEncodeUnsupportedMessage({ format: "mp4", keyHints: true }),
    });
  });
});

const webmWorks = async () => true;

describe("resolveVideoExportFormat", () => {
  const edited = {
    ranges: [{ speed: 1, volume: 0.5, muted: false }],
    fadeIn: 0,
    fadeOut: 0,
  } as const;
  it("falls back from MP4 to WebM when this browser has no AAC encoder", async () => {
    const choice = await resolveVideoExportFormat({
      ...edited,
      selected: "mp4",
      source: opus,
      encodable: opusOnly,
      canWriteWebmVideo: webmWorks,
    });
    expect(choice).toEqual({
      kind: "fallback",
      format: "webm",
      notice: "This browser can't encode AAC audio for MP4, so it was saved as WebM instead.",
    });
  });

  it("keeps MP4 when its audio works here, without asking about WebM video", async () => {
    let asked = 0;
    const canWriteWebmVideo = async () => {
      asked++;
      return true;
    };
    const cases = [
      { ...edited, source: aac, encodable: both },
      // An untouched AAC track is copied, so no encoder is needed.
      { ranges: [{ speed: 1, volume: 1, muted: false }], fadeIn: 0, fadeOut: 0, source: aac },
      { ...edited, source: null },
      { ranges: [{ speed: 1, volume: 0.5, muted: true }], fadeIn: 0, fadeOut: 0, source: aac },
    ];
    for (const audio of cases) {
      expect(
        await resolveVideoExportFormat({
          encodable: opusOnly,
          ...audio,
          selected: "mp4",
          canWriteWebmVideo,
        }),
      ).toEqual({ kind: "selected", format: "mp4" });
    }
    expect(asked).toBe(0);
  });

  it("keeps MP4, and its error, when WebM can't be written either", async () => {
    const noWebmVideo = await resolveVideoExportFormat({
      ...edited,
      selected: "mp4",
      source: aac,
      encodable: opusOnly,
      canWriteWebmVideo: async () => false,
    });
    const noAudioEncoder = await resolveVideoExportFormat({
      ...edited,
      selected: "mp4",
      source: aac,
      encodable: new Set(),
      canWriteWebmVideo: webmWorks,
    });
    expect(noWebmVideo).toEqual({ kind: "selected", format: "mp4" });
    expect(noAudioEncoder).toEqual({ kind: "selected", format: "mp4" });
  });

  it("never changes a WebM selection", async () => {
    expect(
      await resolveVideoExportFormat({
        ...edited,
        selected: "webm",
        source: aac,
        encodable: new Set(),
        canWriteWebmVideo: webmWorks,
      }),
    ).toEqual({ kind: "selected", format: "webm" });
  });
});
