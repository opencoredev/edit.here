import { describe, expect, it } from "vitest";
import {
  createInitialVideoSegments,
  createInitialVideoState,
  firstKeptTime,
  getKeptRanges,
  getRangesDuration,
  isSingleKeptRange,
  lastKeptTime,
  mapIntervalToOutput,
  outputToSourceTime,
  planVideoExport,
  previousKeptTime,
  setVideoInPoint,
  setVideoOutPoint,
  sourceToOutputTime,
  splitVideoAtTime,
  toggleDeleteVideoSegment,
  videoExportFileName,
  videoSegmentsEqual,
  type VideoSegment,
} from "../src/index";

const base = createInitialVideoSegments({ duration: 10 });

/** 0–2 kept, 2–5 cut, 5–10 kept. */
function cutMiddle(): readonly VideoSegment[] {
  const a = splitVideoAtTime({ segments: base, time: 2, newId: "b" });
  const b = splitVideoAtTime({ segments: a, time: 5, newId: "c" });
  return toggleDeleteVideoSegment(b, "b");
}

describe("kept ranges", () => {
  it("merges adjacent kept segments and skips cut ones", () => {
    const split = splitVideoAtTime({ segments: base, time: 4, newId: "b" });
    expect(getKeptRanges(split)).toEqual([{ start: 0, end: 10 }]);
    expect(getKeptRanges(cutMiddle())).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 10 },
    ]);
    expect(getRangesDuration(getKeptRanges(cutMiddle()))).toBe(7);
    expect(isSingleKeptRange(cutMiddle())).toBe(false);
    expect(isSingleKeptRange(split)).toBe(true);
  });

  it("returns no ranges when everything is cut", () => {
    expect(getKeptRanges(toggleDeleteVideoSegment(base, "seg-0"))).toEqual([]);
    expect(firstKeptTime(toggleDeleteVideoSegment(base, "seg-0"))).toBeNull();
    expect(lastKeptTime(toggleDeleteVideoSegment(base, "seg-0"))).toBeNull();
  });
});

describe("timestamp mapping", () => {
  const ranges = getKeptRanges(cutMiddle());

  it("maps source time to output time and back", () => {
    expect(sourceToOutputTime(ranges, 1)).toBe(1);
    expect(sourceToOutputTime(ranges, 3)).toBeNull();
    expect(sourceToOutputTime(ranges, 5)).toBe(2);
    expect(sourceToOutputTime(ranges, 7.5)).toBe(4.5);
    expect(sourceToOutputTime(ranges, 10)).toBe(7);
    expect(outputToSourceTime(ranges, 1)).toBe(1);
    expect(outputToSourceTime(ranges, 2)).toBe(5);
    expect(outputToSourceTime(ranges, 4.5)).toBe(7.5);
    expect(outputToSourceTime(ranges, 99)).toBe(10);
    expect(outputToSourceTime([], 1)).toBeNull();
  });

  it("drops frames inside a cut and retimes frames after it", () => {
    expect(mapIntervalToOutput({ ranges, start: 3, duration: 1 / 30 })).toEqual([]);
    expect(mapIntervalToOutput({ ranges, start: 6, duration: 0.5 })).toEqual([
      { sourceStart: 6, sourceEnd: 6.5, outputStart: 3 },
    ]);
  });

  it("clips an interval that straddles a cut edge", () => {
    const [piece] = mapIntervalToOutput({ ranges, start: 1.9, duration: 0.2 });
    expect(piece?.sourceStart).toBe(1.9);
    expect(piece?.sourceEnd).toBe(2);
    expect(piece?.outputStart).toBeCloseTo(1.9);
    const [late] = mapIntervalToOutput({ ranges, start: 4.9, duration: 0.2 });
    expect(late?.sourceStart).toBe(5);
    expect(late?.outputStart).toBe(2);
  });

  it("splits an interval that spans a short cut into two pieces", () => {
    const short = getKeptRanges(
      toggleDeleteVideoSegment(
        splitVideoAtTime({
          segments: splitVideoAtTime({ segments: base, time: 1, newId: "b" }),
          time: 1.1,
          newId: "c",
        }),
        "b",
      ),
    );
    const pieces = mapIntervalToOutput({ ranges: short, start: 0.95, duration: 0.2 });
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.outputStart).toBeCloseTo(0.95);
    expect(pieces[1]?.sourceStart).toBe(1.1);
    expect(pieces[1]?.outputStart).toBeCloseTo(1);
  });

  it("keeps zero-duration samples inside a kept range", () => {
    expect(mapIntervalToOutput({ ranges, start: 6, duration: 0 })).toEqual([
      { sourceStart: 6, sourceEnd: 6, outputStart: 3 },
    ]);
  });
});

describe("previousKeptTime", () => {
  it("jumps back over a cut for reverse playback", () => {
    const segments = cutMiddle();
    expect(previousKeptTime(segments, 6)).toBe(6);
    const back = previousKeptTime(segments, 4);
    expect(back).not.toBeNull();
    expect(back ?? 0).toBeLessThan(2);
    expect(back ?? 0).toBeGreaterThan(1.99);
  });
});

describe("in and out points", () => {
  it("cuts everything before the in point and after the out point", () => {
    const withIn = setVideoInPoint({ segments: base, time: 2, newId: "in" });
    expect(getKeptRanges(withIn)).toEqual([{ start: 2, end: 10 }]);
    const withOut = setVideoOutPoint({ segments: withIn, time: 8, newId: "out" });
    expect(getKeptRanges(withOut)).toEqual([{ start: 2, end: 8 }]);
  });

  it("moving the in point earlier restores the head", () => {
    const late = setVideoInPoint({ segments: base, time: 4, newId: "a" });
    const early = setVideoInPoint({ segments: late, time: 1, newId: "b" });
    expect(getKeptRanges(early)).toEqual([{ start: 1, end: 10 }]);
  });

  it("moving the out point later restores the tail", () => {
    const early = setVideoOutPoint({ segments: base, time: 3, newId: "a" });
    const late = setVideoOutPoint({ segments: early, time: 9, newId: "b" });
    expect(getKeptRanges(late)).toEqual([{ start: 0, end: 9 }]);
  });

  it("keeps interior cuts when moving the in point", () => {
    const withIn = setVideoInPoint({ segments: cutMiddle(), time: 1, newId: "in" });
    expect(getKeptRanges(withIn)).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 10 },
    ]);
  });

  it("ignores points at the far edge", () => {
    expect(setVideoInPoint({ segments: base, time: 10, newId: "x" })).toBe(base);
    expect(setVideoOutPoint({ segments: base, time: 0, newId: "x" })).toBe(base);
  });
});

describe("export plan", () => {
  const frame = { width: 960, height: 540 };

  it("trims without re-encoding for one range and no crop", () => {
    const state = {
      ...createInitialVideoState(10),
      segments: setVideoInPoint({ segments: base, time: 2, newId: "a" }),
    };
    expect(planVideoExport({ state, frame })).toEqual({
      kind: "trim",
      range: { start: 2, end: 10, speed: 1, volume: 1, muted: false },
      muted: false,
      format: "mp4",
      outputDuration: 8,
      rotation: 0,
      flipX: false,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("re-encodes when segments are concatenated or cropped", () => {
    const state = {
      ...createInitialVideoState(10),
      segments: cutMiddle(),
      cropEnabled: true,
      crop: { x: 0.21875, y: 0, width: 0.5625, height: 1 },
      exportFormat: "webm" as const,
      muted: true,
    };
    const plan = planVideoExport({ state, frame });
    expect(plan.kind).toBe("reencode");
    if (plan.kind !== "reencode") return;
    expect(plan.ranges).toHaveLength(2);
    expect(plan.crop).toEqual({ left: 210, top: 0, width: 540, height: 540 });
    expect(plan.outputDuration).toBe(7);
    expect(plan.muted).toBe(true);
  });

  it("ignores a disabled crop and refuses an empty timeline", () => {
    const state = {
      ...createInitialVideoState(10),
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    };
    expect(planVideoExport({ state, frame }).kind).toBe("trim");
    const empty = { ...state, segments: toggleDeleteVideoSegment(base, "seg-0") };
    expect(planVideoExport({ state: empty, frame })).toEqual({ kind: "empty" });
  });

  it("names the output after the source", () => {
    expect(videoExportFileName("holiday.mov", "mp4")).toBe("holiday-edit.mp4");
    expect(videoExportFileName(".hidden", "webm")).toBe(".hidden-edit.webm");
    expect(videoExportFileName("", "webm")).toBe("video-edit.webm");
  });
});

describe("videoSegmentsEqual", () => {
  it("compares ids, bounds and cut state", () => {
    const split = splitVideoAtTime({ segments: base, time: 4, newId: "b" });
    expect(
      videoSegmentsEqual(
        split,
        split.map((s) => ({ ...s })),
      ),
    ).toBe(true);
    expect(videoSegmentsEqual(split, base)).toBe(false);
    expect(videoSegmentsEqual(split, toggleDeleteVideoSegment(split, "b"))).toBe(false);
    // Setting the in point where it already is changes nothing.
    const trimmed = setVideoInPoint({ segments: base, time: 2, newId: "a" });
    expect(
      videoSegmentsEqual(trimmed, setVideoInPoint({ segments: trimmed, time: 2, newId: "z" })),
    ).toBe(true);
  });
});
