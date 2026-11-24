import { describe, expect, it } from "vitest";
import {
  createInitialVideoSegments,
  createInitialVideoState,
  findSegmentAt,
  getKeptSegments,
  getKeptVideoDuration,
  nextKeptTime,
  restoreAllVideoSegments,
  setVideoTrimBounds,
  splitVideoAtTime,
  toggleDeleteVideoSegment,
} from "../src/index";

const base = createInitialVideoSegments({ duration: 10 });

describe("video timeline", () => {
  it("starts with one segment covering the whole duration", () => {
    expect(base).toEqual([{ id: "seg-0", start: 0, end: 10, deleted: false }]);
    expect(createInitialVideoState(-3).duration).toBe(0);
  });

  it("splits a segment at a time", () => {
    const s = splitVideoAtTime({ segments: base, time: 4, newId: "b" });
    expect(s).toEqual([
      { id: "seg-0", start: 0, end: 4, deleted: false },
      { id: "b", start: 4, end: 10, deleted: false },
    ]);
  });

  it("ignores splits at or near edges and outside the timeline", () => {
    expect(splitVideoAtTime({ segments: base, time: 0, newId: "x" })).toBe(base);
    expect(splitVideoAtTime({ segments: base, time: 0.01, newId: "x" })).toBe(base);
    expect(splitVideoAtTime({ segments: base, time: 11, newId: "x" })).toBe(base);
  });

  it("keeps a deleted flag when splitting a deleted segment", () => {
    const deleted = toggleDeleteVideoSegment(base, "seg-0");
    const s = splitVideoAtTime({ segments: deleted, time: 5, newId: "b" });
    expect(s.every((seg) => seg.deleted)).toBe(true);
  });

  it("deletes and restores segments and reports kept duration", () => {
    let s = splitVideoAtTime({ segments: base, time: 3, newId: "b" });
    s = splitVideoAtTime({ segments: s, time: 7, newId: "c" });
    s = toggleDeleteVideoSegment(s, "b");
    expect(getKeptSegments(s).map((seg) => seg.id)).toEqual(["seg-0", "c"]);
    expect(getKeptVideoDuration(s)).toBeCloseTo(6);
    s = toggleDeleteVideoSegment(s, "b");
    expect(getKeptVideoDuration(s)).toBeCloseTo(10);
    s = restoreAllVideoSegments(toggleDeleteVideoSegment(toggleDeleteVideoSegment(s, "b"), "c"));
    expect(getKeptVideoDuration(s)).toBeCloseTo(10);
  });

  it("sets trim bounds by deleting outside segments", () => {
    const s = setVideoTrimBounds({ segments: base, start: 2, end: 8, newIds: ["in", "out"] });
    expect(s.map((seg) => [seg.start, seg.end, seg.deleted])).toEqual([
      [0, 2, true],
      [2, 8, false],
      [8, 10, true],
    ]);
    expect(getKeptVideoDuration(s)).toBeCloseTo(6);
  });

  it("accepts reversed and out-of-range trim bounds", () => {
    const s = setVideoTrimBounds({ segments: base, start: 12, end: 5, newIds: ["a", "b"] });
    expect(getKeptVideoDuration(s)).toBeCloseTo(5);
    expect(s.at(-1)?.deleted).toBe(false);
  });

  it("ignores a zero-width trim", () => {
    expect(setVideoTrimBounds({ segments: base, start: 4, end: 4, newIds: ["a", "b"] })).toBe(base);
  });

  it("preserves interior deletions when trimming", () => {
    let s = splitVideoAtTime({ segments: base, time: 4, newId: "b" });
    s = splitVideoAtTime({ segments: s, time: 6, newId: "c" });
    s = toggleDeleteVideoSegment(s, "b");
    s = setVideoTrimBounds({ segments: s, start: 1, end: 9, newIds: ["in", "out"] });
    expect(getKeptVideoDuration(s)).toBeCloseTo(6);
  });

  it("finds segments and skips deleted time", () => {
    let s = splitVideoAtTime({ segments: base, time: 5, newId: "b" });
    expect(findSegmentAt(s, 5)?.id).toBe("b");
    expect(findSegmentAt(s, 10)?.id).toBe("b");
    s = toggleDeleteVideoSegment(s, "seg-0");
    expect(nextKeptTime(s, 1)).toBe(5);
    expect(nextKeptTime(s, 6)).toBe(6);
    expect(nextKeptTime(s, 10)).toBeNull();
  });
});
