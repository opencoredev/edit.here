import { describe, expect, it } from "vitest";
import {
  clampVideoSpeed,
  commitVideoState,
  computeAudioGainAt,
  createHistory,
  createInitialVideoState,
  flipVideoX,
  getOutputDuration,
  keepVideoTool,
  needsAudioProcessing,
  orientedFrameSize,
  parseVideoDocumentState,
  planVideoExport,
  rotateVideoCw,
  setVideoFade,
  setVideoInPoint,
  setVideoSpeed,
  setVideoVolume,
  softClipSample,
  splitVideoAtTime,
  timeScaleChannel,
  toggleDeleteVideoSegment,
  toggleVideoTool,
  undoHistory,
  VIDEO_SPEED_PRESETS,
  type VideoDocumentState,
} from "../src/index";

const frame = { width: 1280, height: 720 };
const fresh = (): VideoDocumentState => createInitialVideoState(10);

/** Gain on a 10 s clip at full volume with no fades, overridden by `extra`. */
const at = (outputTime: number, extra: Partial<Parameters<typeof computeAudioGainAt>[0]> = {}) =>
  computeAudioGainAt({
    outputTime,
    outputDuration: 10,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    ...extra,
  });

/** A 10 s document trimmed to start at 2 s. */
const trimmed = (): VideoDocumentState => ({
  ...fresh(),
  segments: setVideoInPoint({ segments: fresh().segments, time: 2, newId: "a" }),
});

describe("video document defaults", () => {
  it("starts with no tray open and untouched transform, speed and audio", () => {
    expect(fresh()).toMatchObject({
      tool: "none",
      rotation: 0,
      flipX: false,
      speed: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("toggles a tool tray open and closed", () => {
    const open = toggleVideoTool(fresh(), "speed");
    expect(open.tool).toBe("speed");
    expect(toggleVideoTool(open, "audio").tool).toBe("audio");
    expect(toggleVideoTool(open, "speed").tool).toBe("none");
  });
});

describe("speed, volume and fade setters", () => {
  it("clamps speed to 0.25–4 and treats junk as 1×", () => {
    expect(setVideoSpeed(fresh(), 8).speed).toBe(4);
    expect(setVideoSpeed(fresh(), 0.1).speed).toBe(0.25);
    expect(clampVideoSpeed(Number.NaN)).toBe(1);
    expect(VIDEO_SPEED_PRESETS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it("returns the same state when nothing changes", () => {
    const state = fresh();
    expect(setVideoSpeed(state, 1)).toBe(state);
    expect(setVideoVolume(state, 1)).toBe(state);
    expect(setVideoFade(state, "in", 0)).toBe(state);
  });

  it("clamps volume to 0–200% and fades to 0–5 s", () => {
    expect(setVideoVolume(fresh(), 3).volume).toBe(2);
    expect(setVideoVolume(fresh(), -1).volume).toBe(0);
    expect(setVideoFade(fresh(), "in", 9).fadeIn).toBe(5);
    expect(setVideoFade(fresh(), "out", 0.5).fadeOut).toBe(0.5);
  });

  it("divides kept time by speed for the output duration", () => {
    const state = {
      ...fresh(),
      segments: setVideoInPoint({ segments: fresh().segments, time: 4, newId: "a" }),
    };
    expect(getOutputDuration({ ...state, speed: 2 })).toBe(3);
    expect(getOutputDuration({ ...state, speed: 0.5 })).toBe(12);
  });

  it("flags audio processing for any speed, volume or fade change", () => {
    const untouched = { speed: 1, volume: 1, fadeIn: 0, fadeOut: 0 };
    expect(needsAudioProcessing(untouched)).toBe(false);
    expect(needsAudioProcessing({ ...untouched, speed: 2 })).toBe(true);
    expect(needsAudioProcessing({ ...untouched, volume: 0 })).toBe(true);
    expect(needsAudioProcessing({ ...untouched, fadeIn: 0.5 })).toBe(true);
    expect(needsAudioProcessing({ ...untouched, fadeOut: 2 })).toBe(true);
  });
});

describe("computeAudioGainAt", () => {
  it("returns the volume, clamped to 0–2, without fades", () => {
    expect(at(5)).toBe(1);
    expect(at(5, { volume: 0 })).toBe(0);
    expect(at(5, { volume: 1.5 })).toBe(1.5);
    expect(at(5, { volume: 2 })).toBe(2);
    expect(at(5, { volume: 7 })).toBe(2);
  });

  it("is silent when muted", () => {
    expect(at(5, { muted: true, volume: 2 })).toBe(0);
  });

  it("ramps up over the fade-in", () => {
    expect(at(0, { fadeIn: 2 })).toBe(0);
    expect(at(1, { fadeIn: 2 })).toBeCloseTo(0.5);
    expect(at(1, { fadeIn: 2, volume: 2 })).toBeCloseTo(1);
    expect(at(2, { fadeIn: 2 })).toBe(1);
    expect(at(6, { fadeIn: 2 })).toBe(1);
  });

  it("ramps down over the fade-out", () => {
    expect(at(8, { fadeOut: 2 })).toBe(1);
    expect(at(9, { fadeOut: 2 })).toBeCloseTo(0.5);
    expect(at(10, { fadeOut: 2 })).toBe(0);
  });

  it("clamps times outside the clip", () => {
    expect(at(-3, { fadeIn: 1 })).toBe(0);
    expect(at(30, { fadeOut: 1 })).toBe(0);
  });

  it("shrinks overlapping fades on a short clip so the ramps meet at full volume", () => {
    const short = { outputDuration: 1, fadeIn: 2, fadeOut: 2 };
    // Each fade scales to 0.5 s; they meet at 0.5 s with no jump.
    expect(at(0, short)).toBe(0);
    expect(at(0.25, short)).toBeCloseTo(0.5);
    expect(at(0.5, short)).toBeCloseTo(1);
    expect(at(0.75, short)).toBeCloseTo(0.5);
    expect(at(1, short)).toBe(0);
    let previous = at(0, short);
    for (let i = 1; i <= 100; i++) {
      const value = at(i / 100, short);
      expect(Math.abs(value - previous)).toBeLessThanOrEqual(0.0201);
      previous = value;
    }
  });

  it("keeps uneven fades in proportion when they overlap", () => {
    const short = { outputDuration: 2, fadeIn: 3, fadeOut: 1 };
    // Scaled to 1.5 s in and 0.5 s out.
    expect(at(0.75, short)).toBeCloseTo(0.5);
    expect(at(1.5, short)).toBeCloseTo(1);
    expect(at(1.75, short)).toBeCloseTo(0.5);
  });

  it("is silent for an empty clip", () => {
    expect(at(0, { outputDuration: 0, fadeIn: 1, fadeOut: 1 })).toBe(0);
  });
});

describe("softClipSample", () => {
  it("passes quiet samples through and keeps loud ones inside [-1, 1]", () => {
    expect(softClipSample(0.5)).toBe(0.5);
    expect(softClipSample(-0.9)).toBe(-0.9);
    expect(softClipSample(1.2)).toBeLessThan(1);
    expect(softClipSample(1.2)).toBeGreaterThan(0.9);
    expect(softClipSample(-5)).toBeGreaterThanOrEqual(-1);
    expect(softClipSample(1.1)).toBeLessThan(softClipSample(1.5));
  });
});

describe("timeScaleChannel", () => {
  const ramp = Float32Array.from({ length: 8 }, (_, i) => i);

  it("halves the frame count at 2× and reads every other sample", () => {
    expect(Array.from(timeScaleChannel(ramp, 2))).toEqual([0, 2, 4, 6]);
  });

  it("interpolates between samples when slowing down", () => {
    const slow = timeScaleChannel(ramp, 0.5);
    expect(slow).toHaveLength(16);
    expect(slow[1]).toBeCloseTo(0.5);
    expect(slow[3]).toBeCloseTo(1.5);
    // Past the last input sample it holds the last value.
    expect(slow[15]).toBe(7);
  });

  it("copies at 1× and handles empty input", () => {
    expect(Array.from(timeScaleChannel(ramp, 1))).toEqual(Array.from(ramp));
    expect(timeScaleChannel(new Float32Array(0), 2)).toHaveLength(0);
  });
});

describe("rotate and flip", () => {
  it("swaps width and height for quarter turns", () => {
    expect(orientedFrameSize(frame, 90)).toEqual({ width: 720, height: 1280 });
    expect(orientedFrameSize(frame, 180)).toEqual(frame);
    expect(orientedFrameSize(frame, 270)).toEqual({ width: 720, height: 1280 });
  });

  it("turns clockwise, turning the crop and its aspect with it", () => {
    const state = {
      ...fresh(),
      cropEnabled: true,
      cropAspect: "16:9" as const,
      crop: { x: 0, y: 0, width: 0.5, height: 0.25 },
    };
    const turned = rotateVideoCw(state);
    expect(turned.rotation).toBe(90);
    expect(turned.cropAspect).toBe("9:16");
    expect(turned.crop).toEqual({ x: 0.75, y: 0, width: 0.25, height: 0.5 });
    expect(rotateVideoCw(rotateVideoCw(rotateVideoCw(turned))).rotation).toBe(0);
    expect(rotateVideoCw({ ...state, cropAspect: "4:5" }).cropAspect).toBe("free");
  });

  it("turns the other way on a mirrored picture so the visible turn stays clockwise", () => {
    const flipped = flipVideoX(fresh());
    expect(rotateVideoCw(flipped).rotation).toBe(270);
  });

  it("mirrors the crop when flipping", () => {
    const state = { ...fresh(), crop: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
    const flipped = flipVideoX(state);
    expect(flipped.flipX).toBe(true);
    expect(flipped.crop.x).toBeCloseTo(0.6);
    expect(flipVideoX(flipped).crop.x).toBeCloseTo(0.1);
  });
});

describe("planVideoExport with transforms, speed and audio", () => {
  it("copies a plain trim", () => {
    expect(planVideoExport({ state: trimmed(), frame }).kind).toBe("trim");
  });

  it.each([
    ["rotation", { rotation: 90 as const }],
    ["flip", { flipX: true }],
    ["speed", { speed: 1.5 }],
    ["volume", { volume: 0.5 }],
    ["fade in", { fadeIn: 1 }],
    ["fade out", { fadeOut: 0.5 }],
  ])("re-encodes for %s", (_name, change) => {
    const plan = planVideoExport({ state: { ...trimmed(), ...change }, frame });
    expect(plan.kind).toBe("reencode");
  });

  it("keeps the copy path for muted audio, whatever the volume and fades", () => {
    const state = { ...trimmed(), muted: true, volume: 2, fadeIn: 1, fadeOut: 1 };
    expect(planVideoExport({ state, frame }).kind).toBe("trim");
  });

  it("carries every setting and divides the duration by speed", () => {
    const state = {
      ...trimmed(),
      rotation: 180 as const,
      flipX: true,
      speed: 2,
      volume: 1.5,
      fadeIn: 0.5,
      fadeOut: 1,
    };
    const plan = planVideoExport({ state, frame });
    expect(plan).toMatchObject({
      kind: "reencode",
      rotation: 180,
      flipX: true,
      ranges: [{ speed: 2, volume: 1.5, muted: false }],
      fadeIn: 0.5,
      fadeOut: 1,
      outputDuration: 4,
      outputWidth: 1280,
      outputHeight: 720,
      crop: null,
    });
  });

  it("sizes a turned export by the turned frame", () => {
    const plan = planVideoExport({ state: { ...fresh(), rotation: 270 }, frame });
    expect(plan).toMatchObject({ kind: "reencode", outputWidth: 720, outputHeight: 1280 });
  });

  it("measures a crop in the turned frame", () => {
    const state: VideoDocumentState = {
      ...fresh(),
      rotation: 90,
      cropEnabled: true,
      crop: { x: 0, y: 0.25, width: 1, height: 0.5 },
    };
    const plan = planVideoExport({ state, frame });
    expect(plan.kind).toBe("reencode");
    if (plan.kind !== "reencode") return;
    // Turned frame is 720 × 1280: full width, middle half of the height.
    expect(plan.crop).toEqual({ left: 0, top: 320, width: 720, height: 640 });
    expect(plan.outputWidth).toBe(720);
    expect(plan.outputHeight).toBe(640);
  });

  it("treats a crop covering the turned frame as no crop", () => {
    const state: VideoDocumentState = {
      ...fresh(),
      rotation: 90,
      cropEnabled: true,
      crop: { x: 0, y: 0, width: 1, height: 0.9999 },
    };
    const plan = planVideoExport({ state, frame });
    expect(plan).toMatchObject({ kind: "reencode", crop: null, outputWidth: 720 });
  });

  it("still refuses an empty timeline", () => {
    const state = {
      ...fresh(),
      speed: 2,
      segments: toggleDeleteVideoSegment(fresh().segments, "seg-0"),
    };
    expect(planVideoExport({ state, frame })).toEqual({ kind: "empty" });
  });
});

describe("video history", () => {
  it("switches tools in place and records edits as undo steps", () => {
    const history = createHistory(fresh());
    const tool = commitVideoState(history, toggleVideoTool(history.present, "audio"));
    expect(tool.past).toHaveLength(0);
    expect(tool.present.tool).toBe("audio");
    const edited = commitVideoState(tool, setVideoVolume(tool.present, 0.5));
    expect(edited.past).toHaveLength(1);
  });

  it("keeps the open tray across undo", () => {
    const history = createHistory(fresh());
    const edited = commitVideoState(history, setVideoSpeed(history.present, 2));
    const switched = commitVideoState(edited, toggleVideoTool(edited.present, "speed"));
    const undone = keepVideoTool(switched, undoHistory(switched));
    expect(undone.present.speed).toBe(1);
    expect(undone.present.tool).toBe("speed");
  });
});

describe("parseVideoDocumentState", () => {
  it("round-trips every field through JSON", () => {
    const state: VideoDocumentState = {
      ...fresh(),
      tool: "audio",
      segments: splitVideoAtTime({ segments: fresh().segments, time: 4, newId: "b" }),
      cropEnabled: true,
      crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      cropAspect: "1:1",
      rotation: 270,
      flipX: true,
      speed: 1.25,
      volume: 1.6,
      muted: true,
      fadeIn: 0.5,
      fadeOut: 2,
      exportFormat: "webm",
    };
    const stored: unknown = JSON.parse(JSON.stringify(state));
    expect(parseVideoDocumentState(stored, 10)).toEqual(state);
  });

  it("fills defaults for a state saved before rotate, speed and audio controls", () => {
    const older = {
      tool: "crop",
      duration: 10,
      segments: [{ id: "seg-0", start: 0, end: 10, deleted: false }],
      crop: { x: 0, y: 0, width: 1, height: 1 },
      cropEnabled: false,
      cropAspect: "free",
      muted: true,
      exportFormat: "mp4",
    };
    expect(parseVideoDocumentState(older, 10)).toEqual({
      ...older,
      rotation: 0,
      flipX: false,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it("clamps stored numbers into range and rejects bad values", () => {
    const stored = { ...fresh(), speed: 40, volume: -2, fadeIn: 30, fadeOut: -1 };
    expect(parseVideoDocumentState(stored, 10)).toMatchObject({
      speed: 4,
      volume: 0,
      fadeIn: 5,
      fadeOut: 0,
    });
    expect(parseVideoDocumentState({ ...fresh(), rotation: 45 }, 10)).toBeNull();
    expect(parseVideoDocumentState({ ...fresh(), tool: "paint" }, 10)).toBeNull();
    expect(parseVideoDocumentState({ ...fresh(), speed: "fast" }, 10)).toBeNull();
  });
});
