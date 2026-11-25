import { describe, expect, it } from "vitest";
import {
  chooseAudioExport,
  createInitialVideoState,
  effectiveSegmentMuted,
  effectiveSegmentSpeed,
  effectiveSegmentVolume,
  getExportRanges,
  getOutputDuration,
  getRangesOutputDuration,
  hasSegmentOverrides,
  mapIntervalToRanges,
  outputToSourceTime,
  parseVideoDocumentState,
  planVideoExport,
  setSegmentMuted,
  setSegmentSpeed,
  setSegmentVolume,
  setVideoInPoint,
  sourceToOutputTime,
  splitVideoAtTime,
  toggleDeleteVideoSegment,
  videoSegmentsEqual,
  type ExportAudioCodec,
  type VideoDocumentState,
} from "../src/index";

const frame = { width: 1280, height: 720 };
const both: ReadonlySet<ExportAudioCodec> = new Set(["aac", "opus"]);
const aac = { codec: "aac", decodable: true } as const;

/** A 10 s video split at 4 s: `a` is [0, 4), `b` is [4, 10). */
function twoClips(): VideoDocumentState {
  const state = createInitialVideoState(10);
  const segments = splitVideoAtTime({ segments: state.segments, time: 4, newId: "b" });
  return { ...state, segments: segments.map((s) => (s.id === "seg-0" ? { ...s, id: "a" } : s)) };
}

const clip = (id: string) => ({ kind: "segment", id }) as const;
const ALL = { kind: "all" } as const;

function segment(state: VideoDocumentState, id: string) {
  const found = state.segments.find((s) => s.id === id);
  if (found === undefined) throw new Error(`no segment ${id}`);
  return found;
}

describe("per-clip overrides", () => {
  it("inherit the document's values until set", () => {
    const state = { ...twoClips(), speed: 1.5, volume: 0.5, muted: true };
    const b = segment(state, "b");
    expect(effectiveSegmentSpeed(b, state)).toBe(1.5);
    expect(effectiveSegmentVolume(b, state)).toBe(0.5);
    expect(effectiveSegmentMuted(b, state)).toBe(true);
    expect(hasSegmentOverrides(b)).toBe(false);
  });

  it("set one clip and leave the others alone", () => {
    let state = twoClips();
    state = setSegmentSpeed(state, clip("b"), 2);
    state = setSegmentMuted(state, clip("b"), true);
    state = setSegmentVolume(state, clip("a"), 0.4);
    expect(segment(state, "b")).toMatchObject({ speed: 2, muted: true });
    expect(segment(state, "a")).toMatchObject({ volume: 0.4 });
    expect("speed" in segment(state, "a")).toBe(false);
    expect(state.speed).toBe(1);
    expect(state.muted).toBe(false);
    expect(state.volume).toBe(1);
  });

  it("clamp clip values to the document ranges", () => {
    const state = setSegmentVolume(setSegmentSpeed(twoClips(), clip("b"), 9), clip("b"), -1);
    expect(segment(state, "b")).toMatchObject({ speed: 4, volume: 0 });
  });

  it("store a clip value equal to the document's as no override (no undefined keys)", () => {
    const set = setSegmentSpeed(twoClips(), clip("b"), 2);
    const back = setSegmentSpeed(set, clip("b"), 1);
    expect(Object.keys(segment(back, "b")).toSorted()).toEqual(["deleted", "end", "id", "start"]);
    expect(hasSegmentOverrides(segment(back, "b"))).toBe(false);
  });

  it("return the same state for a no-op or an unknown clip", () => {
    const state = twoClips();
    expect(setSegmentSpeed(state, clip("b"), 1)).toBe(state);
    expect(setSegmentMuted(state, clip("nope"), true)).toBe(state);
    const set = setSegmentVolume(state, clip("a"), 0.3);
    expect(setSegmentVolume(set, clip("a"), 0.3)).toBe(set);
    expect(setSegmentSpeed(state, ALL, 1)).toBe(state);
  });

  it("All sets the document value and clears that field's overrides everywhere", () => {
    let state = setSegmentSpeed(twoClips(), clip("b"), 2);
    state = setSegmentVolume(state, clip("b"), 0.3);
    state = setSegmentMuted(state, clip("a"), true);
    const fast = setSegmentSpeed(state, ALL, 1.5);
    expect(fast.speed).toBe(1.5);
    expect(fast.segments.every((s) => s.speed === undefined)).toBe(true);
    // Other fields' overrides survive.
    expect(segment(fast, "b").volume).toBe(0.3);
    expect(segment(fast, "a").muted).toBe(true);
    // Same global value, but an override to clear: still an edit.
    const sameSpeed = setSegmentSpeed(state, ALL, 1);
    expect(sameSpeed).not.toBe(state);
    expect(segment(sameSpeed, "b").speed).toBeUndefined();
    const unmuted = setSegmentMuted(state, ALL, false);
    expect(segment(unmuted, "a").muted).toBeUndefined();
  });

  it("survive splits on both halves", () => {
    let state = setSegmentSpeed(twoClips(), clip("b"), 2);
    state = setSegmentVolume(state, clip("b"), 0.25);
    state = setSegmentMuted(state, clip("b"), true);
    const split = splitVideoAtTime({ segments: state.segments, time: 7, newId: "c" });
    expect(split.map((s) => s.id)).toEqual(["a", "b", "c"]);
    for (const id of ["b", "c"]) {
      expect(split.find((s) => s.id === id)).toMatchObject({ speed: 2, volume: 0.25, muted: true });
    }
    // Trim edits split through the same path.
    const trimmed = setVideoInPoint({ segments: state.segments, time: 6, newId: "t" });
    expect(trimmed.find((s) => s.id === "t")).toMatchObject({ speed: 2, muted: true });
  });

  it("make segment lists unequal when only an override differs", () => {
    const state = twoClips();
    const set = setSegmentMuted(state, clip("a"), true);
    expect(videoSegmentsEqual(state.segments, set.segments)).toBe(false);
    expect(videoSegmentsEqual(set.segments, [...set.segments])).toBe(true);
  });
});

describe("output timing with per-clip speed", () => {
  const state = setSegmentSpeed(twoClips(), clip("b"), 2);

  it("sums each kept clip's length over its own speed", () => {
    expect(getOutputDuration(state)).toBe(4 + 6 / 2);
    expect(getOutputDuration({ ...state, speed: 0.5 })).toBe(8 + 3);
    const cut = { ...state, segments: toggleDeleteVideoSegment(state.segments, "a") };
    expect(getOutputDuration(cut)).toBe(3);
  });

  it("maps source to output time and back across a speed change", () => {
    const ranges = getExportRanges(state);
    expect(getRangesOutputDuration(ranges)).toBe(7);
    expect(sourceToOutputTime(ranges, 2)).toBe(2);
    expect(sourceToOutputTime(ranges, 6)).toBe(4 + 1);
    expect(sourceToOutputTime(ranges, 10)).toBe(7);
    expect(outputToSourceTime(ranges, 2)).toBe(2);
    expect(outputToSourceTime(ranges, 5)).toBe(6);
    expect(outputToSourceTime(ranges, 99)).toBe(10);
  });

  it("splits an interval at a speed boundary and reports each piece's range", () => {
    const ranges = getExportRanges(state);
    const pieces = mapIntervalToRanges({ ranges, start: 3.5, duration: 1 });
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ sourceStart: 3.5, sourceEnd: 4, outputStart: 3.5 });
    expect(pieces[0]?.range.speed).toBe(1);
    expect(pieces[1]).toMatchObject({ sourceStart: 4, sourceEnd: 4.5, outputStart: 4 });
    expect(pieces[1]?.range.speed).toBe(2);
    const late = mapIntervalToRanges({ ranges, start: 8, duration: 0.5 });
    expect(late[0]?.outputStart).toBe(4 + 2);
  });
});

describe("getExportRanges", () => {
  it("merges touching clips that play the same", () => {
    const state = setSegmentSpeed(twoClips(), clip("b"), 1);
    expect(getExportRanges(state)).toEqual([
      { start: 0, end: 10, speed: 1, volume: 1, muted: false },
    ]);
  });

  it.each([
    ["speed", (s: VideoDocumentState) => setSegmentSpeed(s, clip("b"), 2)],
    ["volume", (s: VideoDocumentState) => setSegmentVolume(s, clip("b"), 0.3)],
    ["mute", (s: VideoDocumentState) => setSegmentMuted(s, clip("b"), true)],
  ])("keeps clips apart when their %s differs", (_name, edit) => {
    const ranges = getExportRanges(edit(twoClips()));
    expect(ranges.map((r) => [r.start, r.end])).toEqual([
      [0, 4],
      [4, 10],
    ]);
  });

  it("applies the document's values to clips without overrides", () => {
    const state = setSegmentMuted({ ...twoClips(), volume: 0.5, speed: 2 }, clip("b"), true);
    expect(getExportRanges(state)).toEqual([
      { start: 0, end: 4, speed: 2, volume: 0.5, muted: false },
      { start: 4, end: 10, speed: 2, volume: 0.5, muted: true },
    ]);
  });

  it("never merges across a cut", () => {
    const state = twoClips();
    const three = splitVideoAtTime({ segments: state.segments, time: 6, newId: "c" });
    const cut = { ...state, segments: toggleDeleteVideoSegment(three, "b") };
    expect(getExportRanges(cut).map((r) => [r.start, r.end])).toEqual([
      [0, 4],
      [6, 10],
    ]);
  });
});

describe("planVideoExport with per-clip settings", () => {
  it("re-encodes a single clip at a custom speed, carrying the speed on the range", () => {
    const state = setSegmentSpeed(createInitialVideoState(10), clip("seg-0"), 2);
    const plan = planVideoExport({ state, frame });
    expect(plan).toMatchObject({ kind: "reencode", outputDuration: 5 });
    if (plan.kind !== "reencode") return;
    expect(plan.ranges).toEqual([{ start: 0, end: 10, speed: 2, volume: 1, muted: false }]);
  });

  it("copies one muted clip whatever its volume, and re-encodes one quieter clip", () => {
    const base = createInitialVideoState(10);
    const muted = setSegmentVolume(setSegmentMuted(base, clip("seg-0"), true), clip("seg-0"), 2);
    expect(planVideoExport({ state: muted, frame })).toMatchObject({ kind: "trim", muted: true });
    const quiet = setSegmentVolume(base, clip("seg-0"), 0.5);
    expect(planVideoExport({ state: quiet, frame }).kind).toBe("reencode");
  });

  it("re-encodes two clips that differ only in mute, with audio still on", () => {
    const state = setSegmentMuted(twoClips(), clip("b"), true);
    const plan = planVideoExport({ state, frame });
    expect(plan.kind).toBe("reencode");
    if (plan.kind !== "reencode") return;
    expect(plan.muted).toBe(false);
    expect(plan.ranges.map((r) => r.muted)).toEqual([false, true]);
    expect(plan.outputDuration).toBe(10);
  });

  it("marks the plan muted only when every kept clip is muted", () => {
    const state = setSegmentMuted(setSegmentMuted(twoClips(), clip("a"), true), clip("b"), true);
    expect(planVideoExport({ state, frame })).toMatchObject({ muted: true });
  });

  it("computes the output duration from 1× and 2× clips", () => {
    const state = setSegmentMuted(setSegmentSpeed(twoClips(), clip("b"), 2), clip("b"), true);
    expect(planVideoExport({ state, frame })).toMatchObject({
      kind: "reencode",
      outputDuration: 7,
    });
  });
});

describe("chooseAudioExport with per-range settings", () => {
  const base = {
    format: "mp4",
    source: aac,
    encodable: both,
    fadeIn: 0,
    fadeOut: 0,
    keyHints: true,
  } as const;
  const plain = { speed: 1, volume: 1, muted: false };

  it("copies one untouched range", () => {
    expect(chooseAudioExport({ ...base, ranges: [plain] })).toEqual({ kind: "copy" });
  });

  it("exports no audio when every range is muted", () => {
    const muted = { ...plain, muted: true };
    expect(chooseAudioExport({ ...base, ranges: [muted, { ...muted, speed: 2 }] })).toEqual({
      kind: "none",
    });
    expect(chooseAudioExport({ ...base, ranges: [] })).toEqual({ kind: "none" });
  });

  it.each([
    ["an unmuted range at 2×", [{ ...plain, speed: 2 }]],
    ["an unmuted range at 30%", [{ ...plain, volume: 0.3 }]],
    ["a muted range beside an audible one", [plain, { ...plain, muted: true }]],
    ["two plain ranges", [plain, plain]],
  ])("encodes for %s", (_name, ranges) => {
    expect(chooseAudioExport({ ...base, ranges })).toEqual({ kind: "encode", codec: "aac" });
  });

  it("encodes for fades and copies a muted range's odd speed away", () => {
    expect(chooseAudioExport({ ...base, ranges: [plain], fadeIn: 0.5 })).toEqual({
      kind: "encode",
      codec: "aac",
    });
    // A muted single range at 2× isn't heard; nothing to encode.
    expect(chooseAudioExport({ ...base, ranges: [{ speed: 2, volume: 1, muted: true }] })).toEqual({
      kind: "none",
    });
  });
});

describe("persisting per-clip settings", () => {
  it("round-trips overrides through JSON", () => {
    let state = setSegmentSpeed(twoClips(), clip("b"), 2);
    state = setSegmentMuted(state, clip("b"), true);
    state = setSegmentVolume(state, clip("a"), 0.4);
    const restored = parseVideoDocumentState(JSON.parse(JSON.stringify(state)), 10);
    expect(restored).toEqual(state);
  });

  it("reads saves from before per-clip settings and leaves no undefined keys", () => {
    const old = {
      ...twoClips(),
      segments: [
        { id: "a", start: 0, end: 4, deleted: false },
        { id: "b", start: 4, end: 10, deleted: false },
      ],
    };
    const restored = parseVideoDocumentState(old, 10);
    expect(restored?.segments.map((s) => Object.keys(s).length)).toEqual([4, 4]);
  });

  it("clamps stored clip values and rejects wrong types", () => {
    const stored = {
      ...twoClips(),
      segments: [
        { id: "a", start: 0, end: 4, deleted: false, speed: 12, volume: 9 },
        { id: "b", start: 4, end: 10, deleted: false, muted: true },
      ],
    };
    const restored = parseVideoDocumentState(stored, 10);
    expect(restored?.segments[0]).toMatchObject({ speed: 4, volume: 2 });
    expect(restored?.segments[1]?.muted).toBe(true);
    const bad = {
      ...stored,
      segments: [{ id: "a", start: 0, end: 10, deleted: false, muted: "yes" }],
    };
    expect(parseVideoDocumentState(bad, 10)).toBeNull();
  });
});
