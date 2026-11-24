import { describe, expect, it } from "vitest";
import {
  clampViewport,
  clampViewportZoom,
  COMPOSITION_REACH,
  computeImageLayout,
  createInitialVideoSegments,
  DEFAULT_FRAME_CONFIG,
  findSegmentAt,
  firstKeptTime,
  frameIndexAt,
  getKeptRanges,
  lastKeptTime,
  MAX_VIEWPORT_ZOOM,
  minTrimSpan,
  nudgeTrimEdge,
  pinchViewport,
  setVideoInPoint,
  setVideoOutPoint,
  setVideoTrimBounds,
  splitVideoAtTime,
  stageMaxZoom,
  trimPreviewTime,
  zoomViewportAt,
  type ImageGeometry,
  type ImageSize,
  type TrimEdge,
  type VideoSegment,
  type Viewport,
} from "../src/index";

describe("trim edges 50 ms from the clip end (float subtraction)", () => {
  const DURATION = 3.5;
  const FPS = 60;
  // 207 / 60 = 3.45, and 3.5 - 3.45 = 0.04999999999999982.
  const tail = 207 / FPS;

  it("has a tail that subtracts to just under 50 ms", () => {
    expect(DURATION - tail).toBeLessThan(0.05);
  });

  it("splitVideoAtTime splits there", () => {
    const segments = createInitialVideoSegments({ duration: DURATION });
    const split = splitVideoAtTime({ segments, time: tail, newId: "b" });
    expect(split).toHaveLength(2);
    expect(split[0]?.end).toBe(tail);
    expect(split[1]?.start).toBe(tail);
  });

  it("setVideoOutPoint moves the out point there", () => {
    const segments = createInitialVideoSegments({ duration: DURATION });
    const next = setVideoOutPoint({ segments, time: tail, newId: "o" });
    expect(lastKeptTime(next)).toBe(tail);
  });

  it("Left on the out grip from the clip end commits", () => {
    const trim = { in: 0, out: DURATION };
    const target = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "out",
      trim,
      duration: DURATION,
      fps: FPS,
      direction: -1,
      seconds: false,
    });
    expect(target).toBeCloseTo(tail, 9);
    const next = setVideoOutPoint({
      segments: createInitialVideoSegments({ duration: DURATION }),
      time: target,
      newId: "o",
    });
    expect(lastKeptTime(next)).toBeCloseTo(tail, 9);
  });

  it("setVideoInPoint accepts a start 50 ms before the end", () => {
    const head = DURATION - 0.05;
    const next = setVideoInPoint({
      segments: createInitialVideoSegments({ duration: DURATION }),
      time: head,
      newId: "i",
    });
    expect(firstKeptTime(next)).toBe(head);
  });

  it("setVideoTrimBounds keeps a span that subtracts to just under 50 ms", () => {
    const next = setVideoTrimBounds({
      segments: createInitialVideoSegments({ duration: DURATION }),
      start: tail,
      end: DURATION,
      newIds: ["a", "b"],
    });
    expect(getKeptRanges(next)).toEqual([{ start: tail, end: DURATION }]);
  });
});

describe("trimming next to an interior cut", () => {
  // 0-1 s kept, 1-2 s cut, 2-3 s kept.
  const segments: readonly VideoSegment[] = [
    { id: "a", start: 0, end: 1, deleted: false },
    { id: "b", start: 1, end: 2, deleted: true },
    { id: "c", start: 2, end: 3, deleted: false },
  ];

  it("an in point 1 frame before the cut keeps both kept ranges", () => {
    const next = setVideoInPoint({ segments, time: 29 / 30, newId: "n" });
    const ranges = getKeptRanges(next);
    expect(ranges).toHaveLength(2);
    expect(ranges[1]).toEqual({ start: 2, end: 3 });
    // The first range survives, whether or not the 33 ms sliver could be split off.
    expect(ranges[0]?.end).toBe(1);
    expect(ranges[0]?.start).toBeLessThanOrEqual(29 / 30);
  });

  it("an out point 1 frame after the cut keeps both kept ranges", () => {
    const next = setVideoOutPoint({ segments, time: 2 + 1 / 30, newId: "n" });
    const ranges = getKeptRanges(next);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: 0, end: 1 });
    expect(ranges[1]?.start).toBe(2);
    expect(ranges[1]?.end).toBeGreaterThanOrEqual(2 + 1 / 30);
  });

  it("still steps the in grip one frame at a time across its own boundary", () => {
    let next = setVideoInPoint({ segments, time: 0.5, newId: "i1" });
    expect(firstKeptTime(next)).toBe(0.5);
    // One frame on is within 50 ms of the last in point: the boundary itself moves.
    next = setVideoInPoint({ segments: next, time: 0.5 + 1 / 30, newId: "i2" });
    expect(firstKeptTime(next)).toBeCloseTo(0.5 + 1 / 30, 9);
    next = setVideoInPoint({ segments: next, time: 0.5, newId: "i3" });
    expect(firstKeptTime(next)).toBe(0.5);
    expect(getKeptRanges(next)).toEqual([
      { start: 0.5, end: 1 },
      { start: 2, end: 3 },
    ]);
  });

  it("still steps the out grip one frame at a time across its own boundary", () => {
    let next = setVideoOutPoint({ segments, time: 2.5, newId: "o1" });
    next = setVideoOutPoint({ segments: next, time: 2.5 - 1 / 30, newId: "o2" });
    expect(lastKeptTime(next)).toBeCloseTo(2.5 - 1 / 30, 9);
    expect(getKeptRanges(next)[0]).toEqual({ start: 0, end: 1 });
  });
});

describe("zoom ceiling when the composition grows", () => {
  const stage = { width: 1000, height: 800 };

  it("clampViewportZoom honors a raised ceiling", () => {
    expect(clampViewportZoom(12)).toBe(MAX_VIEWPORT_ZOOM);
    expect(clampViewportZoom(12, 16)).toBe(12);
    expect(clampViewportZoom(40, 16)).toBe(16);
  });

  it("stageMaxZoom scales by how much the fit shrank, never below 8", () => {
    expect(stageMaxZoom({ baseFitK: 1, fitK: 1 })).toBe(MAX_VIEWPORT_ZOOM);
    expect(stageMaxZoom({ baseFitK: 1, fitK: 0.8 })).toBeCloseTo(10, 9);
    expect(stageMaxZoom({ baseFitK: 1, fitK: 2 })).toBe(MAX_VIEWPORT_ZOOM);
    expect(stageMaxZoom({ baseFitK: 0, fitK: 1 })).toBe(MAX_VIEWPORT_ZOOM);
    expect(stageMaxZoom({ baseFitK: 1, fitK: 0 })).toBe(MAX_VIEWPORT_ZOOM);
  });

  it("keeps a release at max zoom unclipped, so no output pixel moves", () => {
    // Held fit: the base alone, 1 screen px per output px. The drag grows the output by 25%, so
    // the new fit is 0.8 px per output px.
    const previousK = 1;
    const k = 0.8;
    const before: Viewport = { zoom: MAX_VIEWPORT_ZOOM, x: 120, y: -40 };
    const compensation = (before.zoom * previousK) / k;
    expect(compensation).toBeGreaterThan(MAX_VIEWPORT_ZOOM);
    const maxZoom = stageMaxZoom({ baseFitK: previousK, fitK: k });
    const content = { width: 800, height: 600 };
    const kept = clampViewport({
      viewport: { ...before, zoom: compensation },
      content,
      stage,
      maxZoom,
    });
    expect(kept.zoom).toBeCloseTo(compensation, 9);
    // The old ceiling clipped it back, the jump this guards against.
    expect(
      clampViewport({ viewport: { ...before, zoom: compensation }, content, stage }).zoom,
    ).toBe(MAX_VIEWPORT_ZOOM);
    // On-screen magnification of the base image is unchanged: zoom * k.
    expect(kept.zoom * k).toBeCloseTo(before.zoom * previousK, 9);
  });

  it("zoomViewportAt and pinchViewport zoom up to the raised ceiling", () => {
    const anchor = { x: 0, y: 0 };
    const at = zoomViewportAt({
      viewport: { zoom: 8, x: 0, y: 0 },
      zoom: 100,
      anchor,
      maxZoom: 10,
    });
    expect(at.zoom).toBe(10);
    const pinch = pinchViewport({
      start: { zoom: 8, x: 0, y: 0 },
      from: [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
      ],
      to: [
        { x: -20, y: 0 },
        { x: 20, y: 0 },
      ],
      maxZoom: 12,
    });
    expect(pinch.zoom).toBe(12);
  });
});

/** Screen pixels per output pixel when `output` fits `stage`, as the image stage computes it. */
function fitK(output: ImageSize, stage: ImageSize): number {
  return Math.min(stage.width / output.width, stage.height / output.height);
}

describe("zoom ceiling near the composition reach", () => {
  const stage = { width: 1200, height: 800 };
  const source = { width: 400, height: 300 };
  const geometry: ImageGeometry = {
    crop: { x: 0, y: 0, width: 1, height: 1 },
    rotation: 0,
    flipX: false,
  };

  it("is unclipped at 8.375x the base width (past the old 64x cap)", () => {
    const ratio = 8.375;
    const max = stageMaxZoom({ baseFitK: ratio, fitK: 1 });
    expect(max).toBeCloseTo(MAX_VIEWPORT_ZOOM * ratio, 9);
    expect(max).toBeGreaterThan(64);
    // The release that grows 8.30x to 8.375x at max zoom keeps its compensating zoom.
    const before = stageMaxZoom({ baseFitK: 8.3, fitK: 1 });
    const compensation = (before * 8.375) / 8.3;
    expect(compensation).toBeGreaterThan(64);
    expect(clampViewportZoom(compensation, max)).toBeCloseTo(compensation, 9);
  });

  it("is unclipped for a composition at the full reach on every side", () => {
    const reach = 1 + 2 * COMPOSITION_REACH;
    const bounds = { x: -COMPOSITION_REACH, y: -COMPOSITION_REACH, width: reach, height: reach };
    for (const frame of [
      DEFAULT_FRAME_CONFIG,
      { ...DEFAULT_FRAME_CONFIG, enabled: true, padding: 0 },
      { ...DEFAULT_FRAME_CONFIG, enabled: true, padding: 64 },
    ]) {
      const base = computeImageLayout({ source, geometry, frame });
      const grown = computeImageLayout({ source, geometry, frame, bounds });
      const baseFitK = fitK(base.output, stage);
      const k = fitK(grown.output, stage);
      const ratio = baseFitK / k;
      expect(ratio).toBeLessThanOrEqual(reach + 1e-9);
      expect(stageMaxZoom({ baseFitK, fitK: k })).toBeCloseTo(MAX_VIEWPORT_ZOOM * ratio, 9);
    }
    // Without padding the composition is exactly `reach` base widths: the largest ratio.
    const exact = computeImageLayout({ source, geometry, frame: DEFAULT_FRAME_CONFIG, bounds });
    expect(exact.output.width).toBe(source.width * reach);
    expect(stageMaxZoom({ baseFitK: reach, fitK: 1 })).toBeCloseTo(MAX_VIEWPORT_ZOOM * reach, 9);
  });
});

describe("arrow nudges across an interior cut at 30 fps", () => {
  const FPS = 30;
  const DURATION = 3;
  // 0-1 s kept, 1-2 s cut, 2-3 s kept.
  const cut: readonly VideoSegment[] = [
    { id: "a", start: 0, end: 1, deleted: false },
    { id: "b", start: 1, end: 2, deleted: true },
    { id: "c", start: 2, end: 3, deleted: false },
  ];
  const trimOf = (segments: readonly VideoSegment[]) => ({
    in: firstKeptTime(segments) ?? 0,
    out: lastKeptTime(segments) ?? DURATION,
  });
  const frame = (t: number) => Math.round(t * FPS);

  /** Presses an arrow `presses` times on one grip, committing each like the editor. */
  function press(args: {
    readonly segments: readonly VideoSegment[];
    readonly edge: TrimEdge;
    readonly direction: -1 | 1;
    readonly presses: number;
  }): { readonly segments: readonly VideoSegment[]; readonly seen: readonly number[] } {
    let segments = args.segments;
    const seen: number[] = [];
    for (let i = 0; i < args.presses; i++) {
      const time = nudgeTrimEdge({
        edge: args.edge,
        segments,
        trim: trimOf(segments),
        duration: DURATION,
        fps: FPS,
        direction: args.direction,
        seconds: false,
      });
      const commit = args.edge === "in" ? setVideoInPoint : setVideoOutPoint;
      segments = commit({ segments, time, newId: `${args.edge}${args.direction}-${i}` });
      const trim = trimOf(segments);
      seen.push(args.edge === "in" ? trim.in : trim.out);
    }
    return { segments, seen };
  }

  it("moves the start grip from 0.933 s past the cut, then into 2-3 s", () => {
    const start = setVideoInPoint({ segments: cut, time: 28 / FPS, newId: "i" });
    expect(firstKeptTime(start)).toBeCloseTo(28 / FPS, 9);
    const right = press({ segments: start, edge: "in", direction: 1, presses: 3 });
    expect(right.seen.map(frame)).toEqual([60, 61, 62]);
    expect(right.seen[0]).toBe(2);
    expect(getKeptRanges(right.segments)).toHaveLength(1);
    expect(getKeptRanges(right.segments)[0]?.end).toBe(3);
  });

  it("moves the end grip from 2.067 s past the cut, then into 0-1 s", () => {
    const start = setVideoOutPoint({ segments: cut, time: 62 / FPS, newId: "o" });
    expect(lastKeptTime(start)).toBeCloseTo(62 / FPS, 9);
    const left = press({ segments: start, edge: "out", direction: -1, presses: 3 });
    expect(left.seen.map(frame)).toEqual([30, 29, 28]);
    expect(left.seen[0]).toBe(1);
    expect(getKeptRanges(left.segments)).toHaveLength(1);
    expect(getKeptRanges(left.segments)[0]?.start).toBe(0);
  });

  it("moves back the other way from the far side of the cut", () => {
    const atTwo = press({
      segments: setVideoInPoint({ segments: cut, time: 28 / FPS, newId: "i" }),
      edge: "in",
      direction: 1,
      presses: 1,
    });
    expect(firstKeptTime(atTwo.segments)).toBe(2);
    const back = press({ segments: atTwo.segments, edge: "in", direction: -1, presses: 3 });
    expect(back.seen.map(frame)).toEqual([59, 58, 57]);

    const atOne = press({
      segments: setVideoOutPoint({ segments: cut, time: 62 / FPS, newId: "o" }),
      edge: "out",
      direction: -1,
      presses: 1,
    });
    expect(lastKeptTime(atOne.segments)).toBe(1);
    const forward = press({ segments: atOne.segments, edge: "out", direction: 1, presses: 3 });
    expect(forward.seen.map(frame)).toEqual([31, 32, 33]);
  });

  it("stays put when the jump would leave less than the shortest span kept", () => {
    // 0-1 s kept, 1-2.95 s cut, 2.95-3 s kept: past the cut only 50 ms is left, under 2 frames.
    const thin: readonly VideoSegment[] = [
      { id: "a", start: 0, end: 1, deleted: false },
      { id: "b", start: 1, end: 2.95, deleted: true },
      { id: "c", start: 2.95, end: 3, deleted: false },
    ];
    const start = setVideoInPoint({ segments: thin, time: 28 / FPS, newId: "i" });
    const trim = trimOf(start);
    const time = nudgeTrimEdge({
      edge: "in",
      segments: start,
      trim,
      duration: DURATION,
      fps: FPS,
      direction: 1,
      seconds: false,
    });
    expect(time).toBe(trim.in);
  });

  it("never stalls: every press moves the grip until it reports it can't", () => {
    const layouts: readonly (readonly VideoSegment[])[] = [
      cut,
      [
        { id: "a", start: 0, end: 1, deleted: false },
        { id: "b", start: 1, end: 3, deleted: false },
      ],
      [
        { id: "a", start: 0, end: 1.01, deleted: false },
        { id: "b", start: 1.01, end: 1.06, deleted: true },
        { id: "c", start: 1.06, end: 1.111, deleted: false },
        { id: "d", start: 1.111, end: 3, deleted: false },
      ],
    ];
    for (const fps of [24, 25, 30, 60]) {
      for (const layout of layouts) {
        for (const edge of ["in", "out"] as const) {
          let segments = layout;
          const away: -1 | 1 = edge === "in" ? 1 : -1;
          const back: -1 | 1 = edge === "in" ? -1 : 1;
          for (const direction of [away, back]) {
            let blocked = false;
            for (let i = 0; i < 400 && !blocked; i++) {
              const trim = trimOf(segments);
              const current = edge === "in" ? trim.in : trim.out;
              const time = nudgeTrimEdge({
                edge,
                segments,
                trim,
                duration: DURATION,
                fps,
                direction,
                seconds: false,
              });
              if (time === current) {
                blocked = true;
                continue;
              }
              const commit = edge === "in" ? setVideoInPoint : setVideoOutPoint;
              segments = commit({ segments, time, newId: `n${direction}-${i}` });
              const next = trimOf(segments);
              const moved = (edge === "in" ? next.in : next.out) - current;
              expect(moved * direction).toBeGreaterThan(1e-9);
            }
            expect(blocked).toBe(true);
            // Blocked at the far handle's shortest span, or at the clip's own start or end.
            const end = trimOf(segments);
            const span = end.out - end.in;
            const atClipEdge = edge === "in" ? end.in === 0 : end.out === DURATION;
            expect(atClipEdge || span < 2 * minTrimSpan(fps) + 1e-9).toBe(true);
          }
        }
      }
    }
  });
});

/** Splits `duration` at the given frames, deletes the listed segment indexes. */
function cutLayout(args: {
  readonly duration: number;
  readonly fps: number;
  readonly frames: readonly number[];
  readonly deleted: readonly number[];
}): readonly VideoSegment[] {
  let segments = createInitialVideoSegments({ duration: args.duration });
  for (const [i, f] of args.frames.entries()) {
    segments = splitVideoAtTime({ segments, time: f / args.fps, newId: `s${i}` });
  }
  expect(segments).toHaveLength(args.frames.length + 1);
  return segments.map((s, i) => (args.deleted.includes(i) ? { ...s, deleted: true } : s));
}
/** Seconds of media `segments` keep. */
const keptOf = (segments: readonly VideoSegment[]) =>
  getKeptRanges(segments).reduce((t, r) => t + r.end - r.start, 0);

describe("nudges that restore or skip footage next to a short cut", () => {
  it("ArrowLeft on Trim start restores a short cut back to its start (2.99 s, 30 fps)", () => {
    const FPS = 30;
    const DURATION = 2.99;
    const segments = cutLayout({ duration: DURATION, fps: FPS, frames: [86, 88], deleted: [0, 1] });
    const trim = { in: firstKeptTime(segments) ?? 0, out: lastKeptTime(segments) ?? DURATION };
    expect(trim.in).toBe(88 / FPS);
    // Less than the shortest span is kept before the press: the restore must still go through.
    expect(keptOf(segments)).toBeLessThan(minTrimSpan(FPS));
    const time = nudgeTrimEdge({
      edge: "in",
      segments,
      trim,
      duration: DURATION,
      fps: FPS,
      direction: -1,
      seconds: false,
    });
    expect(time).toBe(86 / FPS);
    const next = setVideoInPoint({ segments, time, newId: "n" });
    expect(firstKeptTime(next)).toBe(86 / FPS);
    expect(keptOf(next)).toBeCloseTo(DURATION - 86 / FPS, 9);
    expect(Math.round(keptOf(next) * 1000)).toBe(123);
  });

  it("Shift+Right on Trim start lands on the cut's end, not short of it (1.10 s, 24 fps)", () => {
    const FPS = 24;
    const DURATION = 1.1;
    const segments = cutLayout({ duration: DURATION, fps: FPS, frames: [2, 22, 25], deleted: [1] });
    const trim = { in: 0, out: DURATION };
    expect(firstKeptTime(segments)).toBe(0);
    const time = nudgeTrimEdge({
      edge: "in",
      segments,
      trim,
      duration: DURATION,
      fps: FPS,
      direction: 1,
      seconds: true,
    });
    expect(time).toBe(22 / FPS);
    const next = setVideoInPoint({ segments, time, newId: "n" });
    expect(firstKeptTime(next)).toBe(22 / FPS);
    expect(keptOf(next)).toBeGreaterThanOrEqual(minTrimSpan(FPS));
    expect(Math.round(keptOf(next) * 1000)).toBe(183);
  });
});

describe("a one-second trim nudge that lands inside a cut (3 s, 30 fps)", () => {
  const FPS = 30;
  const DURATION = 3;
  const nudge = (args: {
    readonly segments: readonly VideoSegment[];
    readonly edge: TrimEdge;
    readonly direction: -1 | 1;
  }) =>
    nudgeTrimEdge({
      edge: args.edge,
      segments: args.segments,
      trim: { in: firstKeptTime(args.segments) ?? 0, out: lastKeptTime(args.segments) ?? DURATION },
      duration: DURATION,
      fps: FPS,
      direction: args.direction,
      seconds: true,
    });

  it("Shift+Right on Trim start returns the first kept frame past the cut, not 1.0 s", () => {
    // Frames 15-30 cut: 1.0 s (frame 30) is a deleted frame.
    const segments: readonly VideoSegment[] = [
      { id: "a", start: 0, end: 15 / FPS, deleted: false },
      { id: "b", start: 15 / FPS, end: 31 / FPS, deleted: true },
      { id: "c", start: 31 / FPS, end: DURATION, deleted: false },
    ];
    const time = nudge({ segments, edge: "in", direction: 1 });
    expect(time).toBe(31 / FPS);
    const next = setVideoInPoint({ segments, time, newId: "n" });
    expect(firstKeptTime(next)).toBe(time);
    // Committing the raw 1.0 s step lands on the same frame.
    expect(firstKeptTime(setVideoInPoint({ segments, time: 1, newId: "n" }))).toBe(time);
  });

  it("Shift+Left on Trim end returns the last kept frame before the cut, not 2.0 s", () => {
    // Frames 59-74 cut: the frame before 2.0 s (frame 59) is a deleted frame.
    const segments: readonly VideoSegment[] = [
      { id: "a", start: 0, end: 59 / FPS, deleted: false },
      { id: "b", start: 59 / FPS, end: 75 / FPS, deleted: true },
      { id: "c", start: 75 / FPS, end: DURATION, deleted: false },
    ];
    const time = nudge({ segments, edge: "out", direction: -1 });
    expect(time).toBe(59 / FPS);
    const next = setVideoOutPoint({ segments, time, newId: "n" });
    expect(lastKeptTime(next)).toBe(time);
    expect(lastKeptTime(setVideoOutPoint({ segments, time: 2, newId: "n" }))).toBe(time);
  });
});

const seg = (id: string, start: number, end: number, deleted: boolean): VideoSegment => ({
  id,
  start,
  end,
  deleted,
});

describe("trimPreviewTime parks the preview on a kept frame at the trim edge", () => {
  it("shows the kept 1.9 s frame, not the cut 1.8 s frame, after Trim End lands on 1.96 s", () => {
    const segments = [
      seg("a", 0, 0.5, false),
      seg("b", 0.5, 1.9, true),
      seg("c", 1.9, 1.96, false),
      seg("d", 1.96, 2.5, true),
      seg("e", 2.5, 3, true),
    ];
    const t = trimPreviewTime({ edge: "out", segments, fps: 10, duration: 3 });
    expect(t).toBeCloseTo(1.95, 9);
    expect(t).toBeGreaterThanOrEqual(1.9);
    expect(t).toBeLessThan(1.96);
    expect(findSegmentAt(segments, t)?.deleted).toBe(false);
    expect(frameIndexAt(t, 10)).toBe(19);
  });

  it("stays strictly inside a kept segment shorter than one frame", () => {
    const segments = [
      seg("a", 0, 0.5, false),
      seg("b", 0.5, 1.9, true),
      seg("c", 1.9, 1.94, false),
      seg("d", 1.94, 3, true),
    ];
    const t = trimPreviewTime({ edge: "out", segments, fps: 10, duration: 3 });
    expect(t).toBeCloseTo(1.92, 9);
    expect(t).toBeGreaterThan(1.9);
    expect(t).toBeLessThan(1.94);
    expect(findSegmentAt(segments, t)?.id).toBe("c");
  });

  it("centres on the first kept frame for the in point at 30 fps", () => {
    const segments = [seg("a", 0, 31 / 30, true), seg("b", 31 / 30, 3, false)];
    const t = trimPreviewTime({ edge: "in", segments, fps: 30, duration: 3 });
    expect(t).toBeCloseTo(1.05, 9);
    expect(frameIndexAt(t, 30)).toBe(31);
    expect(findSegmentAt(segments, t)?.deleted).toBe(false);
  });

  it("centres on the last kept frame for the out point at 30 fps", () => {
    const segments = [seg("a", 0, 59 / 30, false), seg("b", 59 / 30, 3, true)];
    const t = trimPreviewTime({ edge: "out", segments, fps: 30, duration: 3 });
    expect(t).toBeCloseTo(1.95, 9);
    expect(frameIndexAt(t, 30)).toBe(58);
    expect(findSegmentAt(segments, t)?.deleted).toBe(false);
  });

  it("centres on the last kept frame for the out point at 1 fps and sub-1 fps", () => {
    const oneFps = [seg("a", 0, 2, false), seg("b", 2, 3, true)];
    const t1 = trimPreviewTime({ edge: "out", segments: oneFps, fps: 1, duration: 3 });
    expect(t1).toBeCloseTo(1.5, 9);
    expect(findSegmentAt(oneFps, t1)?.deleted).toBe(false);

    const halfFps = [seg("a", 0, 4, false), seg("b", 4, 6, true)];
    const tHalf = trimPreviewTime({ edge: "out", segments: halfFps, fps: 0.5, duration: 6 });
    expect(tHalf).toBeCloseTo(3, 9);
    expect(findSegmentAt(halfFps, tHalf)?.deleted).toBe(false);
  });

  it("returns 0 when everything is cut", () => {
    const segments = [seg("a", 0, 3, true)];
    expect(trimPreviewTime({ edge: "in", segments, fps: 30, duration: 3 })).toBe(0);
    expect(trimPreviewTime({ edge: "out", segments, fps: 30, duration: 3 })).toBe(0);
  });
});
