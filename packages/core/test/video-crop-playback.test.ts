import { describe, expect, it } from "vitest";
import {
  createInitialVideoState,
  cropAspectRatio,
  cropToPixels,
  filmstripTimestamps,
  fitCropToAspect,
  formatDurationLabel,
  formatTimecode,
  FULL_RECT,
  getActiveCrop,
  nextShuttle,
  normalizeFrameRate,
  resizeCrop,
  setVideoCropAspect,
  SHUTTLE_PAUSED,
  shuttleRate,
  snapToFrame,
  stepFrame,
  toggleVideoCrop,
  type NormalizedRect,
  type ShuttleState,
} from "../src/index";

const frame = { width: 1920, height: 1080 };

function pixelAspect(rect: NormalizedRect): number {
  return (rect.width * frame.width) / (rect.height * frame.height);
}

function inside(rect: NormalizedRect): boolean {
  const e = 1e-9;
  return (
    rect.x >= -e && rect.y >= -e && rect.x + rect.width <= 1 + e && rect.y + rect.height <= 1 + e
  );
}

describe("crop aspect presets", () => {
  it("knows each preset ratio", () => {
    expect(cropAspectRatio("free")).toBeNull();
    expect(cropAspectRatio("16:9")).toBeCloseTo(16 / 9);
    expect(cropAspectRatio("9:16")).toBeCloseTo(9 / 16);
    expect(cropAspectRatio("1:1")).toBe(1);
    expect(cropAspectRatio("4:5")).toBeCloseTo(0.8);
  });

  it("fits the largest centered rect with the preset aspect", () => {
    const square = fitCropToAspect({ rect: FULL_RECT, aspect: "1:1", frame });
    expect(pixelAspect(square)).toBeCloseTo(1);
    expect(square.height).toBeCloseTo(1);
    expect(square.x + square.width / 2).toBeCloseTo(0.5);
    const tall = fitCropToAspect({ rect: FULL_RECT, aspect: "9:16", frame });
    expect(pixelAspect(tall)).toBeCloseTo(9 / 16);
    expect(fitCropToAspect({ rect: square, aspect: "free", frame })).toBe(square);
  });

  it("keeps an off-center crop inside the frame", () => {
    const corner = { x: 0.9, y: 0.9, width: 0.1, height: 0.1 };
    const fitted = fitCropToAspect({ rect: corner, aspect: "4:5", frame });
    expect(inside(fitted)).toBe(true);
    expect(pixelAspect(fitted)).toBeCloseTo(0.8);
  });
});

describe("resizeCrop", () => {
  const square = fitCropToAspect({ rect: FULL_RECT, aspect: "1:1", frame });

  it("moves without leaving the frame", () => {
    const moved = resizeCrop({ rect: square, handle: "move", dx: 1, dy: 1, aspect: "1:1", frame });
    expect(moved.x + moved.width).toBeCloseTo(1);
    expect(moved.width).toBeCloseTo(square.width);
  });

  it("keeps the aspect when dragging a corner or an edge", () => {
    const small = resizeCrop({
      rect: square,
      handle: "se",
      dx: -0.2,
      dy: -0.05,
      aspect: "1:1",
      frame,
    });
    expect(pixelAspect(small)).toBeCloseTo(1);
    expect(small.x).toBeCloseTo(square.x);
    expect(small.y).toBeCloseTo(square.y);
    const edge = resizeCrop({ rect: small, handle: "e", dx: 0.1, dy: 0, aspect: "1:1", frame });
    expect(pixelAspect(edge)).toBeCloseTo(1);
    expect(inside(edge)).toBe(true);
    const grown = resizeCrop({ rect: small, handle: "nw", dx: -2, dy: -2, aspect: "1:1", frame });
    expect(inside(grown)).toBe(true);
    expect(pixelAspect(grown)).toBeCloseTo(1);
  });

  it("drags free edges independently and never collapses", () => {
    const free = resizeCrop({
      rect: FULL_RECT,
      handle: "w",
      dx: 0.25,
      dy: 0.5,
      aspect: "free",
      frame,
    });
    expect(free).toEqual({ x: 0.25, y: 0, width: 0.75, height: 1 });
    const collapsed = resizeCrop({
      rect: FULL_RECT,
      handle: "e",
      dx: -5,
      dy: 0,
      aspect: "free",
      frame,
    });
    expect(collapsed.width).toBeGreaterThan(0);
    expect(inside(collapsed)).toBe(true);
  });
});

describe("cropToPixels", () => {
  it("produces even, in-bounds pixel rects", () => {
    const px = cropToPixels({ rect: { x: 0.1234, y: 0.0567, width: 0.333, height: 0.777 }, frame });
    for (const value of [px.left, px.top, px.width, px.height]) expect(value % 2).toBe(0);
    expect(px.left + px.width).toBeLessThanOrEqual(frame.width);
    expect(px.top + px.height).toBeLessThanOrEqual(frame.height);
  });

  it("handles odd source sizes and tiny crops", () => {
    const odd = { width: 641, height: 359 };
    const full = cropToPixels({ rect: FULL_RECT, frame: odd });
    expect(full).toEqual({ left: 0, top: 0, width: 640, height: 358 });
    const tiny = cropToPixels({
      rect: { x: 0.999, y: 0.999, width: 0.0001, height: 0.0001 },
      frame: odd,
    });
    // clampNormalizedRect keeps at least 1% of each edge: 6.41px floors to an even 6.
    expect(tiny.width).toBe(6);
    expect(tiny.left + tiny.width).toBeLessThanOrEqual(640);
    expect(tiny.top + tiny.height).toBeLessThanOrEqual(358);
  });

  it("gives a square 1:1 crop on a 16:9 source", () => {
    const square = fitCropToAspect({ rect: FULL_RECT, aspect: "1:1", frame });
    expect(cropToPixels({ rect: square, frame })).toEqual({
      left: 420,
      top: 0,
      width: 1080,
      height: 1080,
    });
  });
});

describe("crop state", () => {
  it("toggles crop and applies the aspect preset on first enable", () => {
    const state = { ...createInitialVideoState(5), cropAspect: "1:1" as const };
    const on = toggleVideoCrop({ state, frame });
    expect(on.cropEnabled).toBe(true);
    expect(pixelAspect(on.crop)).toBeCloseTo(1);
    expect(getActiveCrop(on)).toBe(on.crop);
    const off = toggleVideoCrop({ state: on, frame });
    expect(off.cropEnabled).toBe(false);
    expect(getActiveCrop(off)).toBeNull();
    expect(off.crop).toBe(on.crop);
  });

  it("changing the aspect refits and enables crop", () => {
    const next = setVideoCropAspect({ state: createInitialVideoState(5), aspect: "9:16", frame });
    expect(next.cropEnabled).toBe(true);
    expect(pixelAspect(next.crop)).toBeCloseTo(9 / 16);
  });
});

describe("shuttle", () => {
  it("speeds up on repeated L and caps at 8x", () => {
    let state: ShuttleState = SHUTTLE_PAUSED;
    const rates: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = nextShuttle(state, "l");
      rates.push(shuttleRate(state));
    }
    expect(rates).toEqual([1, 2, 4, 8, 8]);
  });

  it("J plays backward, K pauses, the opposite key resets to 1x", () => {
    const back = nextShuttle(nextShuttle(SHUTTLE_PAUSED, "j"), "j");
    expect(shuttleRate(back)).toBe(-2);
    expect(shuttleRate(nextShuttle(back, "l"))).toBe(1);
    expect(nextShuttle(back, "k")).toEqual(SHUTTLE_PAUSED);
    expect(shuttleRate(SHUTTLE_PAUSED)).toBe(0);
  });
});

describe("frames and timecodes", () => {
  it("steps one frame and clamps to the clip", () => {
    const fps = 30;
    const next = stepFrame({ time: 0, fps, direction: 1, duration: 2 });
    expect(Math.floor(next * fps)).toBe(1);
    const prev = stepFrame({ time: next, fps, direction: -1, duration: 2 });
    expect(Math.floor(prev * fps)).toBe(0);
    expect(stepFrame({ time: 0, fps, direction: -1, duration: 2 })).toBeCloseTo(0.5 / fps);
    const last = stepFrame({ time: 2, fps, direction: 1, duration: 2 });
    expect(Math.floor(last * fps)).toBe(59);
  });

  it("snaps to frame starts despite float noise", () => {
    expect(snapToFrame(0.1, 30)).toBeCloseTo(0.1);
    expect(snapToFrame(0.11, 30)).toBeCloseTo(0.1);
  });

  it("formats timecodes and duration labels", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
    expect(formatTimecode(61.5, 30)).toBe("01:01:15");
    expect(formatTimecode(3725, 25)).toBe("1:02:05:00");
    expect(formatTimecode(1.999, 29.97)).toBe("00:01:29");
    expect(formatDurationLabel(3.42)).toBe("3.4s");
    expect(formatDurationLabel(65)).toBe("1:05");
  });

  it("normalizes unknown frame rates", () => {
    expect(normalizeFrameRate(null)).toBe(30);
    expect(normalizeFrameRate(Number.POSITIVE_INFINITY)).toBe(30);
    expect(normalizeFrameRate(23.976)).toBe(23.976);
  });

  it("spaces filmstrip timestamps inside the clip", () => {
    expect(filmstripTimestamps({ duration: 4, count: 4 })).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(filmstripTimestamps({ duration: 0, count: 4 })).toEqual([]);
  });
});
