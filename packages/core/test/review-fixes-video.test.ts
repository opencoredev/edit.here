import { describe, expect, it } from "vitest";
import {
  createInitialVideoSegments,
  defaultVideoExportFormat,
  firstKeptTime,
  lastKeptTime,
  MIN_SEGMENT_DURATION,
  minTrimSpan,
  nudgeTrimEdge,
  setVideoInPoint,
  setVideoOutPoint,
  snapTrimEdge,
  type ExportAudioCodec,
  type ExportVideoCodec,
  type VideoTrim,
} from "../src/index";

const FPS = 30;
const DURATION = 3.5;
const full: VideoTrim = { in: 0, out: DURATION };

const onFrame = (t: number) => Math.abs(t * FPS - Math.round(t * FPS)) < 1e-6;

/** Applies a trim edge the way the editor commits it, returning the kept span. */
function commit(edge: "in" | "out", time: number, trim: VideoTrim = full): VideoTrim {
  let segments = createInitialVideoSegments({ duration: DURATION });
  if (trim.in > 0) segments = setVideoInPoint({ segments, time: trim.in, newId: "i" });
  if (trim.out < DURATION) segments = setVideoOutPoint({ segments, time: trim.out, newId: "o" });
  const next = (edge === "in" ? setVideoInPoint : setVideoOutPoint)({
    segments,
    time,
    newId: "n",
  });
  return { in: firstKeptTime(next) ?? NaN, out: lastKeptTime(next) ?? NaN };
}

describe("minimum trim span", () => {
  it("is a whole number of frames no shorter than MIN_SEGMENT_DURATION", () => {
    expect(minTrimSpan(30)).toBeCloseTo(2 / 30);
    expect(minTrimSpan(24)).toBeCloseTo(2 / 24);
    expect(minTrimSpan(60)).toBeCloseTo(3 / 60);
    expect(minTrimSpan(10)).toBeCloseTo(1 / 10);
    for (const fps of [10, 23.976, 24, 25, 29.97, 30, 50, 60, 120]) {
      expect(minTrimSpan(fps)).toBeGreaterThanOrEqual(MIN_SEGMENT_DURATION - 1e-9);
      expect(minTrimSpan(fps)).toBeGreaterThanOrEqual(1 / fps - 1e-9);
    }
  });
});

describe("dragging a trim handle", () => {
  it("clamps the in point inward instead of snapping back to 0 near the out point", () => {
    const trim: VideoTrim = { in: 0, out: 2 };
    // Requests between the limit and the out point, including ones that round past the limit.
    for (const time of [1.94, 1.95, 1.96, 1.97, 1.99, 2, 2.5]) {
      const snapped = snapTrimEdge({ edge: "in", time, trim, duration: DURATION, fps: FPS });
      expect(onFrame(snapped)).toBe(true);
      expect(snapped).toBeCloseTo(2 - minTrimSpan(FPS));
      const kept = commit("in", snapped, trim);
      expect(kept.in).toBeCloseTo(snapped);
      expect(kept.out).toBeCloseTo(2);
    }
  });

  it("clamps the out point inward near the in point", () => {
    const trim: VideoTrim = { in: 1, out: DURATION };
    for (const time of [1.01, 1.04, 1.05, 1.06, 0.5]) {
      const snapped = snapTrimEdge({ edge: "out", time, trim, duration: DURATION, fps: FPS });
      expect(snapped).toBeCloseTo(1 + minTrimSpan(FPS));
      const kept = commit("out", snapped, trim);
      expect(kept.out).toBeCloseTo(snapped);
      expect(kept.in).toBeCloseTo(1);
    }
  });

  it("never lands where the split would be ignored next to the clip's start or end", () => {
    for (let i = 0; i <= 200; i++) {
      const time = (i / 200) * DURATION;
      const inPoint = snapTrimEdge({ edge: "in", time, trim: full, duration: DURATION, fps: FPS });
      expect(inPoint === 0 || inPoint >= MIN_SEGMENT_DURATION - 1e-9).toBe(true);
      expect(commit("in", inPoint).in).toBeCloseTo(inPoint);
      const outPoint = snapTrimEdge({
        edge: "out",
        time,
        trim: full,
        duration: DURATION,
        fps: FPS,
      });
      expect(outPoint === DURATION || DURATION - outPoint >= MIN_SEGMENT_DURATION - 1e-9).toBe(
        true,
      );
      expect(commit("out", outPoint).out).toBeCloseTo(outPoint);
    }
  });

  it("keeps the out point on the clip's end when the end is off the frame grid", () => {
    const duration = 3.51;
    const trim: VideoTrim = { in: 0, out: duration };
    expect(snapTrimEdge({ edge: "out", time: 3.509, trim, duration, fps: FPS })).toBe(duration);
  });
});

describe("arrow-key nudges at 30 fps", () => {
  it("moves the in point off 0 on the first ArrowRight", () => {
    const next = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "in",
      trim: full,
      duration: DURATION,
      fps: FPS,
      direction: 1,
      seconds: false,
    });
    expect(next).toBeCloseTo(2 / 30);
    expect(next).toBeGreaterThanOrEqual(MIN_SEGMENT_DURATION);
    expect(commit("in", next).in).toBeCloseTo(next);
  });

  it("moves the out point off the end on the first ArrowLeft", () => {
    const next = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "out",
      trim: full,
      duration: DURATION,
      fps: FPS,
      direction: -1,
      seconds: false,
    });
    expect(next).toBeCloseTo(DURATION - 2 / 30);
    expect(commit("out", next).out).toBeCloseTo(next);
  });

  it("then steps one frame at a time, and back to the ends", () => {
    let trim = full;
    trim = {
      ...trim,
      in: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: DURATION }),
        edge: "in",
        trim,
        duration: DURATION,
        fps: FPS,
        direction: 1,
        seconds: false,
      }),
    };
    trim = {
      ...trim,
      in: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: DURATION }),
        edge: "in",
        trim,
        duration: DURATION,
        fps: FPS,
        direction: 1,
        seconds: false,
      }),
    };
    expect(trim.in).toBeCloseTo(3 / 30);
    trim = {
      ...trim,
      in: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: DURATION }),
        edge: "in",
        trim,
        duration: DURATION,
        fps: FPS,
        direction: -1,
        seconds: false,
      }),
    };
    expect(trim.in).toBeCloseTo(2 / 30);
    trim = {
      ...trim,
      in: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: DURATION }),
        edge: "in",
        trim,
        duration: DURATION,
        fps: FPS,
        direction: -1,
        seconds: false,
      }),
    };
    expect(trim.in).toBe(0);

    const end = 3.51;
    let out: VideoTrim = { in: 0, out: end };
    out = {
      ...out,
      out: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: end }),
        edge: "out",
        trim: out,
        duration: end,
        fps: FPS,
        direction: -1,
        seconds: false,
      }),
    };
    expect(end - out.out).toBeGreaterThanOrEqual(MIN_SEGMENT_DURATION);
    expect(onFrame(out.out)).toBe(true);
    out = {
      ...out,
      out: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: end }),
        edge: "out",
        trim: out,
        duration: end,
        fps: FPS,
        direction: 1,
        seconds: false,
      }),
    };
    expect(out.out).toBe(end);
  });

  it("stops at the shortest span instead of crossing or doing nothing silently", () => {
    let trim: VideoTrim = { in: 1, out: 1 + 3 / 30 };
    trim = {
      ...trim,
      in: nudgeTrimEdge({
        segments: createInitialVideoSegments({ duration: DURATION }),
        edge: "in",
        trim,
        duration: DURATION,
        fps: FPS,
        direction: 1,
        seconds: false,
      }),
    };
    expect(trim.out - trim.in).toBeCloseTo(2 / 30);
    const blocked = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "in",
      trim,
      duration: DURATION,
      fps: FPS,
      direction: 1,
      seconds: false,
    });
    expect(blocked).toBeCloseTo(trim.in);
    const blockedOut = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "out",
      trim,
      duration: DURATION,
      fps: FPS,
      direction: -1,
      seconds: false,
    });
    expect(blockedOut).toBeCloseTo(trim.out);
  });

  it("Shift steps a second", () => {
    const next = nudgeTrimEdge({
      segments: createInitialVideoSegments({ duration: DURATION }),
      edge: "in",
      trim: full,
      duration: DURATION,
      fps: FPS,
      direction: 1,
      seconds: true,
    });
    expect(next).toBeCloseTo(1);
  });
});

describe("default video export format", () => {
  const videoAll: ReadonlySet<ExportVideoCodec> = new Set(["avc", "vp9", "vp8", "av1"]);
  const aacOpus: ReadonlySet<ExportAudioCodec> = new Set(["aac", "opus"]);
  const opusOnly: ReadonlySet<ExportAudioCodec> = new Set(["opus"]);
  const none: ReadonlySet<ExportAudioCodec> = new Set();

  it("starts on MP4 when the browser encodes AAC (Safari, Chrome)", () => {
    expect(
      defaultVideoExportFormat({
        hasAudio: true,
        encodableAudio: aacOpus,
        encodableVideo: videoAll,
      }),
    ).toBe("mp4");
  });

  it("starts on WebM when AAC can't be encoded but Opus can (Chromium on Linux)", () => {
    expect(
      defaultVideoExportFormat({
        hasAudio: true,
        encodableAudio: opusOnly,
        encodableVideo: videoAll,
      }),
    ).toBe("webm");
  });

  it("keeps MP4 for a silent clip, since no audio needs encoding", () => {
    expect(
      defaultVideoExportFormat({ hasAudio: false, encodableAudio: none, encodableVideo: videoAll }),
    ).toBe("mp4");
  });

  it("starts on WebM when H.264 can't be encoded", () => {
    expect(
      defaultVideoExportFormat({
        hasAudio: false,
        encodableAudio: none,
        encodableVideo: new Set<ExportVideoCodec>(["vp9"]),
      }),
    ).toBe("webm");
  });

  it("falls back to MP4 when neither format works, so the error names the MP4 problem", () => {
    expect(
      defaultVideoExportFormat({ hasAudio: true, encodableAudio: none, encodableVideo: videoAll }),
    ).toBe("mp4");
  });
});

/** Nudges an edge and commits it onto the running segment list, like the editor. */
function run(
  steps: readonly { edge: "in" | "out"; direction: -1 | 1 }[],
  duration = DURATION,
): VideoTrim[] {
  let segments = createInitialVideoSegments({ duration });
  const seen: VideoTrim[] = [];
  for (const [index, step] of steps.entries()) {
    const trim = { in: firstKeptTime(segments) ?? 0, out: lastKeptTime(segments) ?? duration };
    const time = nudgeTrimEdge({ ...step, segments, trim, duration, fps: FPS, seconds: false });
    segments = (step.edge === "in" ? setVideoInPoint : setVideoOutPoint)({
      segments,
      time,
      newId: `s${index}`,
    });
    seen.push({ in: firstKeptTime(segments) ?? NaN, out: lastKeptTime(segments) ?? NaN });
  }
  return seen;
}

describe("chained trim commits", () => {
  it("steps the in point frame by frame past a boundary it just made", () => {
    const right = { edge: "in", direction: 1 } as const;
    const left = { edge: "in", direction: -1 } as const;
    const seen = run([right, right, right, left, left, left]);
    expect(seen.map((t) => Math.round(t.in * FPS))).toEqual([2, 3, 4, 3, 2, 0]);
    for (const t of seen) expect(t.out).toBeCloseTo(DURATION);
  });

  it("steps the out point frame by frame on a clip whose end is off the frame grid", () => {
    const end = 6.013;
    const left = { edge: "out", direction: -1 } as const;
    const right = { edge: "out", direction: 1 } as const;
    const seen = run([left, left, left, right, right, right], end);
    const frames = seen.map((t) => (t.out === end ? "end" : Math.round(t.out * FPS)));
    expect(frames).toEqual([178, 177, 176, 177, 178, "end"]);
  });

  it("closes the span down to the minimum from both sides and stops there", () => {
    const steps = Array.from({ length: 120 }, (_, i) =>
      i % 2 === 0
        ? ({ edge: "in", direction: 1 } as const)
        : ({ edge: "out", direction: -1 } as const),
    );
    const last = run(steps).at(-1);
    if (last === undefined) throw new Error("no steps");
    expect(last.out - last.in).toBeCloseTo(minTrimSpan(FPS));
  });
});
