import { describe, expect, it } from "vitest";
import {
  allClipsMuted,
  createInitialVideoState,
  effectiveSegmentMuted,
  setSegmentMuted,
  splitVideoAtTime,
  targetMuted,
  toggleDeleteVideoSegment,
  toggleTargetMuted,
  type VideoDocumentState,
} from "../src/index";

const ALL = { kind: "all" } as const;
const clip = (id: string) => ({ kind: "segment", id }) as const;

/** A 10 s video split at 4 s: `a` is [0, 4), `b` is [4, 10). */
function twoClips(): VideoDocumentState {
  const state = createInitialVideoState(10);
  const segments = splitVideoAtTime({ segments: state.segments, time: 4, newId: "b" });
  return { ...state, segments: segments.map((s) => (s.id === "seg-0" ? { ...s, id: "a" } : s)) };
}

const heard = (state: VideoDocumentState) =>
  state.segments.map((s) => !effectiveSegmentMuted(s, state));

describe("the All mute button", () => {
  it("mutes every clip when they are mixed, as its Mute label says", () => {
    const mutedAll = setSegmentMuted(twoClips(), ALL, true);
    const mixed = setSegmentMuted(mutedAll, clip("b"), false);
    expect(heard(mixed)).toEqual([false, true]);
    expect(allClipsMuted(mixed)).toBe(false);
    expect(targetMuted(mixed, ALL)).toBe(false);

    const next = toggleTargetMuted(mixed, ALL);
    expect(heard(next)).toEqual([false, false]);
    expect(next.muted).toBe(true);
    expect(next.segments.every((s) => s.muted === undefined)).toBe(true);
  });

  it("unmutes every clip when all are muted", () => {
    const mutedAll = setSegmentMuted(twoClips(), ALL, true);
    expect(allClipsMuted(mutedAll)).toBe(true);
    const next = toggleTargetMuted(mutedAll, ALL);
    expect(heard(next)).toEqual([true, true]);
  });

  it("reads clips muted one by one as all muted, and unmutes them together", () => {
    let state = twoClips();
    state = setSegmentMuted(state, clip("a"), true);
    state = setSegmentMuted(state, clip("b"), true);
    expect(state.muted).toBe(false);
    expect(allClipsMuted(state)).toBe(true);
    expect(heard(toggleTargetMuted(state, ALL))).toEqual([true, true]);
  });

  it("ignores deleted clips", () => {
    const state = setSegmentMuted(twoClips(), clip("a"), true);
    const bDeleted = { ...state, segments: toggleDeleteVideoSegment(state.segments, "b") };
    expect(allClipsMuted(state)).toBe(false);
    expect(allClipsMuted(bDeleted)).toBe(true);
  });

  it("toggles one clip from what that clip shows", () => {
    const mixed = setSegmentMuted(setSegmentMuted(twoClips(), ALL, true), clip("b"), false);
    expect(heard(toggleTargetMuted(mixed, clip("b")))).toEqual([false, false]);
    expect(heard(toggleTargetMuted(mixed, clip("a")))).toEqual([true, true]);
  });
});
