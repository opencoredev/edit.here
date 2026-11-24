/**
 * Kept-segment timeline math: merging kept segments into ranges, mapping source times onto the
 * exported (concatenated, retimed) timeline and back, and in/out point edits. Pure; no DOM.
 */
import { clamp, MIN_SEGMENT_DURATION, MIN_SEGMENT_SPAN, splitVideoAtTime } from "../operations";
import type { VideoDocumentState, VideoSegment } from "../types";
import { effectiveSegmentMuted, effectiveSegmentSpeed, effectiveSegmentVolume } from "./adjust";

/** A half-open source interval `[start, end)` in seconds that survives export. */
export type KeptRange = {
  readonly start: number;
  readonly end: number;
};

/**
 * A kept range with the speed and sound it exports with: one or more neighbouring kept segments
 * whose effective speed, volume and mute all match. Plain `KeptRange`s play at 1×.
 */
export type ExportRange = KeptRange & {
  readonly speed: number;
  readonly volume: number;
  readonly muted: boolean;
};

/** One slice of a source interval placed on the output timeline (output seconds). */
export type OutputPiece = {
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly outputStart: number;
};

/** An `OutputPiece` and the range it fell in, so the caller can read that range's speed or gain. */
export type RangePiece<R extends KeptRange> = OutputPiece & { readonly range: R };

const EPSILON = 1e-6;

/** Kept segments merged into ordered, non-touching ranges. */
export function getKeptRanges(segments: readonly VideoSegment[]): readonly KeptRange[] {
  const ranges: KeptRange[] = [];
  for (const segment of segments) {
    if (segment.deleted || segment.end - segment.start <= EPSILON) continue;
    const last = ranges.at(-1);
    if (last !== undefined && segment.start - last.end <= EPSILON) {
      ranges[ranges.length - 1] = { start: last.start, end: segment.end };
    } else {
      ranges.push({ start: segment.start, end: segment.end });
    }
  }
  return ranges;
}

/**
 * Kept segments as export ranges. Touching segments merge only when their effective speed,
 * volume and mute match, so each range plays at one speed and one gain.
 */
export function getExportRanges(
  state: Pick<VideoDocumentState, "segments" | "speed" | "volume" | "muted">,
): readonly ExportRange[] {
  const ranges: ExportRange[] = [];
  for (const segment of state.segments) {
    if (segment.deleted || segment.end - segment.start <= EPSILON) continue;
    const speed = effectiveSegmentSpeed(segment, state);
    const volume = effectiveSegmentVolume(segment, state);
    const muted = effectiveSegmentMuted(segment, state);
    const last = ranges.at(-1);
    if (
      last !== undefined &&
      segment.start - last.end <= EPSILON &&
      last.speed === speed &&
      last.volume === volume &&
      last.muted === muted
    ) {
      ranges[ranges.length - 1] = { ...last, end: segment.end };
    } else {
      ranges.push({ start: segment.start, end: segment.end, speed, volume, muted });
    }
  }
  return ranges;
}

/** Playback speed of a range: its own for an `ExportRange`, 1 for a plain `KeptRange`. */
export function rangeSpeed(range: KeptRange | ExportRange): number {
  return "speed" in range ? range.speed : 1;
}

/** Source seconds covered by the ranges (before any speed change). */
export function getRangesDuration(ranges: readonly KeptRange[]): number {
  return ranges.reduce((total, r) => total + (r.end - r.start), 0);
}

/** Output seconds the ranges take: each range's length divided by its speed. */
export function getRangesOutputDuration(ranges: readonly (KeptRange | ExportRange)[]): number {
  return ranges.reduce((total, r) => total + (r.end - r.start) / rangeSpeed(r), 0);
}

/** Output time for a source time, or null when the source time is cut. */
export function sourceToOutputTime(
  ranges: readonly (KeptRange | ExportRange)[],
  time: number,
): number | null {
  let offset = 0;
  for (const range of ranges) {
    const speed = rangeSpeed(range);
    if (time < range.start - EPSILON) return null;
    if (time < range.end - EPSILON) return offset + Math.max(0, time - range.start) / speed;
    offset += (range.end - range.start) / speed;
  }
  const last = ranges.at(-1);
  return last !== undefined && Math.abs(time - last.end) <= EPSILON ? offset : null;
}

/** Source time for an output time, clamped to the kept timeline. Null when nothing is kept. */
export function outputToSourceTime(
  ranges: readonly (KeptRange | ExportRange)[],
  time: number,
): number | null {
  const first = ranges[0];
  if (first === undefined) return null;
  let remaining = Math.max(0, time);
  for (const range of ranges) {
    const speed = rangeSpeed(range);
    const length = (range.end - range.start) / speed;
    if (remaining < length) return range.start + remaining * speed;
    remaining -= length;
  }
  return ranges.at(-1)?.end ?? first.end;
}

/**
 * Places the source interval `[start, start + duration)` on the output timeline. Returns one
 * piece per range it overlaps (usually zero or one; more when a cut or a range edge falls inside
 * the interval), each with the range it came from. `outputStart` is in output seconds: earlier
 * ranges count at their own speed, and the offset into this range is divided by its speed.
 */
export function mapIntervalToRanges<R extends KeptRange | ExportRange>(args: {
  readonly ranges: readonly R[];
  readonly start: number;
  readonly duration: number;
}): readonly RangePiece<R>[] {
  const { ranges, start } = args;
  const end = start + Math.max(0, args.duration);
  const pieces: RangePiece<R>[] = [];
  let offset = 0;
  for (const range of ranges) {
    const speed = rangeSpeed(range);
    const sourceStart = Math.max(start, range.start);
    const sourceEnd = Math.min(end, range.end);
    const hasLength = sourceEnd - sourceStart > EPSILON;
    // A zero-duration sample still belongs to the range that contains its instant.
    const instant = args.duration <= 0 && start >= range.start && start < range.end;
    if (hasLength || instant) {
      pieces.push({
        sourceStart,
        sourceEnd,
        outputStart: offset + (sourceStart - range.start) / speed,
        range,
      });
    }
    offset += (range.end - range.start) / speed;
  }
  return pieces;
}

/** `mapIntervalToRanges` without the range on each piece. */
export function mapIntervalToOutput(args: {
  readonly ranges: readonly (KeptRange | ExportRange)[];
  readonly start: number;
  readonly duration: number;
}): readonly OutputPiece[] {
  return mapIntervalToRanges(args).map(({ sourceStart, sourceEnd, outputStart }) => ({
    sourceStart,
    sourceEnd,
    outputStart,
  }));
}

/** The kept time at or before `time`, for reverse playback; null when nothing is kept before it. */
export function previousKeptTime(segments: readonly VideoSegment[], time: number): number | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s === undefined || s.deleted) continue;
    if (time >= s.end) return Math.max(s.start, s.end - EPSILON);
    if (time >= s.start) return time;
  }
  return null;
}

/** Start of the first kept segment, or null when everything is cut. */
export function firstKeptTime(segments: readonly VideoSegment[]): number | null {
  return segments.find((s) => !s.deleted)?.start ?? null;
}

/** End of the last kept segment, or null when everything is cut. */
export function lastKeptTime(segments: readonly VideoSegment[]): number | null {
  return segments.findLast((s) => !s.deleted)?.end ?? null;
}

/**
 * Moves the trim edge's own boundary (the one at `edge`, the previous in or out point) onto
 * `time` when it lies within `MIN_SEGMENT_DURATION` of it and both segments beside it stay at
 * least that long. A split that close to a boundary is ignored, so without this a trim handle
 * stepped one frame from its last position would not move. Other boundaries, such as the edges
 * of a cut inside the kept span, never move: shifting one would make the trim swallow the kept
 * segment beside it.
 */
function moveNearbyBoundary(args: {
  readonly segments: readonly VideoSegment[];
  readonly time: number;
  readonly edge: number;
}): readonly VideoSegment[] {
  const { segments, time, edge } = args;
  for (let i = 1; i < segments.length; i++) {
    const left = segments[i - 1];
    const right = segments[i];
    if (left === undefined || right === undefined) continue;
    const boundary = right.start;
    if (Math.abs(boundary - edge) > EPSILON) continue;
    const distance = Math.abs(boundary - time);
    if (distance <= EPSILON || distance >= MIN_SEGMENT_DURATION) continue;
    if (time - left.start < MIN_SEGMENT_SPAN) continue;
    if (right.end - time < MIN_SEGMENT_SPAN) continue;
    return [
      ...segments.slice(0, i - 1),
      { ...left, end: time },
      { ...right, start: time },
      ...segments.slice(i + 1),
    ];
  }
  return segments;
}

/**
 * Sets the in point at `time`. Everything before it is cut; segments that were only cut because
 * they sat before the previous in point are restored, so moving the in point earlier works.
 * Cuts after the previous in point are left alone. `newId` names the segment created by the split.
 */
export function setVideoInPoint(args: {
  readonly segments: readonly VideoSegment[];
  readonly time: number;
  readonly newId: string;
}): readonly VideoSegment[] {
  const duration = args.segments.at(-1)?.end ?? 0;
  const time = clamp(args.time, 0, duration);
  if (duration - time < MIN_SEGMENT_SPAN) return args.segments;
  const previousIn = firstKeptTime(args.segments) ?? duration;
  const segments = moveNearbyBoundary({ segments: args.segments, time, edge: previousIn });
  const split = splitVideoAtTime({ segments, time, newId: args.newId });
  return split.map((s) => {
    if (s.end <= time + EPSILON) return s.deleted ? s : { ...s, deleted: true };
    if (s.start < previousIn - EPSILON && s.deleted) return { ...s, deleted: false };
    return s;
  });
}

/** Mirror of `setVideoInPoint`: cuts everything after `time` and restores the old tail cut. */
export function setVideoOutPoint(args: {
  readonly segments: readonly VideoSegment[];
  readonly time: number;
  readonly newId: string;
}): readonly VideoSegment[] {
  const duration = args.segments.at(-1)?.end ?? 0;
  const time = clamp(args.time, 0, duration);
  if (time < MIN_SEGMENT_SPAN) return args.segments;
  const previousOut = lastKeptTime(args.segments) ?? 0;
  const segments = moveNearbyBoundary({ segments: args.segments, time, edge: previousOut });
  const split = splitVideoAtTime({ segments, time, newId: args.newId });
  return split.map((s) => {
    if (s.start >= time - EPSILON) return s.deleted ? s : { ...s, deleted: true };
    if (s.end > previousOut + EPSILON && s.deleted) return { ...s, deleted: false };
    return s;
  });
}

/** True when the kept media is one contiguous range, so export can trim instead of concatenate. */
export function isSingleKeptRange(segments: readonly VideoSegment[]): boolean {
  return getKeptRanges(segments).length === 1;
}

/**
 * Whether two segment lists are the same cut with the same clip overrides, so a no-op edit can
 * skip the undo stack.
 */
export function videoSegmentsEqual(
  a: readonly VideoSegment[],
  b: readonly VideoSegment[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((segment, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      segment.id === other.id &&
      segment.start === other.start &&
      segment.end === other.end &&
      segment.deleted === other.deleted &&
      segment.volume === other.volume &&
      segment.muted === other.muted &&
      segment.speed === other.speed
    );
  });
}

// ---------------------------------------------------------------------------
// Trim handles

/** The kept span the trim handles sit on, in source seconds. */
export type VideoTrim = { readonly in: number; readonly out: number };

export type TrimEdge = "in" | "out";

const FRAME_EPSILON = 1e-6;

/**
 * The smallest kept span the handles allow, and the smallest step off either end of the clip: at
 * least `MIN_SEGMENT_DURATION` (shorter splits are ignored) and one frame, in whole frames.
 */
export function minTrimSpan(fps: number): number {
  const frames = Math.max(1, Math.ceil(MIN_SEGMENT_DURATION * fps - FRAME_EPSILON));
  return frames / fps;
}

/**
 * Where a trim handle lands for a requested `time`: on a frame boundary, inside `[0, duration]`,
 * at least `minTrimSpan` from the other handle, and either on the clip's end or far enough from
 * it that the split is kept. The limits snap inward (floor for the in point, ceil for the out
 * point), so the result never overshoots them and never falls back to the clip's start or end.
 *
 * `toward` picks how an off-frame time rounds: -1 down, 1 up, 0 to the nearest frame. Nudges pass
 * their direction so a step always moves the handle.
 */
export function snapTrimEdge(args: {
  readonly edge: TrimEdge;
  readonly time: number;
  readonly trim: VideoTrim;
  readonly duration: number;
  readonly fps: number;
  readonly toward?: -1 | 0 | 1;
}): number {
  const { edge, trim, duration, fps } = args;
  const toward = args.toward ?? 0;
  const gap = minTrimSpan(fps);
  const toFrame = (t: number): number => {
    if (toward > 0) return Math.ceil(t * fps - FRAME_EPSILON) / fps;
    if (toward < 0) return Math.floor(t * fps + FRAME_EPSILON) / fps;
    return Math.round(t * fps) / fps;
  };

  if (edge === "in") {
    const hi = Math.floor((trim.out - gap) * fps + FRAME_EPSILON) / fps;
    if (hi < 0) return trim.in;
    const t = clamp(toFrame(args.time), 0, hi);
    // Between the start and `gap` the split would be ignored: land on one side of that zone.
    if (t > FRAME_EPSILON && t < gap - FRAME_EPSILON) {
      const up = toward > 0 || (toward === 0 && t >= gap / 2);
      return up && gap <= hi + FRAME_EPSILON ? gap : 0;
    }
    return t;
  }

  const lo = Math.ceil((trim.in + gap) * fps - FRAME_EPSILON) / fps;
  if (lo > duration + FRAME_EPSILON) return trim.out;
  // The last out point before the end whose split is kept.
  const lastBeforeEnd = Math.floor((duration - gap) * fps + FRAME_EPSILON) / fps;
  const t = clamp(Math.min(duration, toFrame(args.time)), Math.min(lo, duration), duration);
  if (t < duration - FRAME_EPSILON && t > lastBeforeEnd + FRAME_EPSILON) {
    const down = toward < 0 || (toward === 0 && t - lastBeforeEnd < duration - t);
    return down && lastBeforeEnd >= lo - FRAME_EPSILON ? lastBeforeEnd : duration;
  }
  return t;
}

/**
 * Where the trim edge lands when committing `edge` at `time` exactly as the editor does (through
 * `setVideoInPoint` or `setVideoOutPoint`), or null when that is not a nudge result worth
 * returning. The landed edge is the first kept time (in) or last kept time (out) after the commit,
 * which can differ from `time` when `time` falls inside a cut. The committed edge must move strictly
 * in `direction` from `current` and must not leave media on the wrong side of `time`: a split the
 * commit ignores keeps the footage before `time` (in) or after it (out), so the handle would land
 * somewhere other than where the nudge said. The edge may land past `time` when `time` is the
 * start of a cut, which skips the cut. Moving inward must leave at least `gap` of kept media;
 * moving outward is allowed even when less than that is kept, so a short span can grow again.
 */
function simulateTrim(args: {
  readonly segments: readonly VideoSegment[];
  readonly edge: TrimEdge;
  readonly time: number;
  readonly current: number;
  readonly direction: -1 | 1;
  readonly gap: number;
}): number | null {
  const { segments, edge, time, current, direction, gap } = args;
  const commit = edge === "in" ? setVideoInPoint : setVideoOutPoint;
  const next = commit({ segments, time, newId: "__probe__" });
  const landed = edge === "in" ? firstKeptTime(next) : lastKeptTime(next);
  if (landed === null) return null;
  if ((landed - current) * direction <= FRAME_EPSILON) return null;
  if (edge === "in" ? landed < time - FRAME_EPSILON : landed > time + FRAME_EPSILON) return null;
  // Moving outward restores footage, so it can't shrink the kept span below what it was.
  const outward = (edge === "in") === direction < 0;
  return outward || getRangesDuration(getKeptRanges(next)) >= gap - FRAME_EPSILON ? landed : null;
}

/**
 * Interior segment boundaries a nudge from `current` toward `snapped` may land on instead, best
 * first: those within `MIN_SEGMENT_SPAN` of `snapped` (a split that close is ignored), then those
 * between `current` and `snapped`, then, for a single-frame step, those past `snapped`. Each group
 * is ordered by distance from `snapped`. Boundaries that would leave the handles closer than
 * `gap` by `trim` are skipped.
 */
function nudgeCandidates(args: {
  readonly segments: readonly VideoSegment[];
  readonly edge: TrimEdge;
  readonly trim: VideoTrim;
  readonly current: number;
  readonly snapped: number;
  readonly direction: -1 | 1;
  readonly gap: number;
  readonly seconds: boolean;
}): readonly number[] {
  const { segments, edge, trim, current, snapped, direction, gap, seconds } = args;
  const near: number[] = [];
  const between: number[] = [];
  const beyond: number[] = [];
  for (const segment of segments.slice(1)) {
    const boundary = segment.start;
    if ((boundary - current) * direction <= FRAME_EPSILON) continue;
    if (
      edge === "in"
        ? boundary > trim.out - gap + FRAME_EPSILON
        : boundary < trim.in + gap - FRAME_EPSILON
    ) {
      continue;
    }
    if (
      [near, between, beyond].some((group) => group.some((b) => Math.abs(b - boundary) <= EPSILON))
    ) {
      continue;
    }
    if (Math.abs(boundary - snapped) < MIN_SEGMENT_SPAN) near.push(boundary);
    else if ((snapped - boundary) * direction > 0) between.push(boundary);
    else if (!seconds) beyond.push(boundary);
  }
  const bySnapped = (a: number, b: number): number => Math.abs(a - snapped) - Math.abs(b - snapped);
  return [
    ...near.toSorted(bySnapped),
    ...between.toSorted(bySnapped),
    ...beyond.toSorted(bySnapped),
  ];
}

/**
 * Where an arrow-key nudge moves a trim handle: one frame (or `seconds` = one second) in
 * `direction`, at least `minTrimSpan` when leaving the clip's start or end, then snapped by
 * `snapTrimEdge`. Every result is checked by committing it on `segments` (`simulateTrim`). When
 * the snapped step fails, because its split would be ignored next to an interior boundary (the
 * edge of a cut, say) or it would leave less than `minTrimSpan` of kept media, the nudge tries
 * the interior boundaries instead (`nudgeCandidates`). Returns where the edge actually lands after
 * that commit (a step into a cut lands past it, on the next kept frame), or the current time when
 * nothing in that direction commits.
 */
export function nudgeTrimEdge(args: {
  readonly edge: TrimEdge;
  readonly segments: readonly VideoSegment[];
  readonly trim: VideoTrim;
  readonly duration: number;
  readonly fps: number;
  readonly direction: -1 | 1;
  readonly seconds: boolean;
}): number {
  const { edge, segments, trim, duration, fps, direction } = args;
  const gap = minTrimSpan(fps);
  const current = edge === "in" ? trim.in : trim.out;
  let target = current + direction * (args.seconds ? 1 : 1 / fps);
  if (edge === "in" && direction > 0 && current < gap - FRAME_EPSILON) {
    target = Math.max(target, gap);
  }
  if (edge === "out" && direction < 0 && current > duration - gap + FRAME_EPSILON) {
    target = Math.min(target, duration - gap);
  }
  const snapped = snapTrimEdge({ edge, time: target, trim, duration, fps, toward: direction });
  const landAt = (time: number): number | null =>
    simulateTrim({ segments, edge, time, current, direction, gap });
  const landed = landAt(snapped);
  if (landed !== null) return landed;
  const candidates = nudgeCandidates({
    segments,
    edge,
    trim,
    current,
    snapped,
    direction,
    gap,
    seconds: args.seconds,
  });
  for (const candidate of candidates) {
    const edgeAt = landAt(candidate);
    if (edgeAt !== null) return edgeAt;
  }
  return current;
}

/**
 * Where to park the preview after a trim lands, so it shows a kept frame at that edge: the
 * middle of the first kept frame for the in point, of the last kept frame for the out point.
 * When the kept segment covers only part of that frame, the middle of the part it covers, so
 * the time stays strictly inside the segment and never inside a neighbouring cut. 0 when
 * nothing is kept.
 */
export function trimPreviewTime(args: {
  readonly edge: TrimEdge;
  readonly segments: readonly VideoSegment[];
  readonly fps: number;
  readonly duration: number;
}): number {
  const { edge, segments, fps, duration } = args;
  const kept =
    edge === "in" ? segments.find((s) => !s.deleted) : segments.findLast((s) => !s.deleted);
  if (kept === undefined) return 0;
  // The frame holding the segment's first instant (in) or last instant (out).
  // Use ceil(end * fps - eps) - 1 for `out` so low frame rates (<= 1 fps) never cancel out.
  const firstFrame = Math.floor(kept.start * fps + FRAME_EPSILON);
  const frame =
    edge === "in"
      ? firstFrame
      : Math.max(firstFrame, Math.ceil(kept.end * fps - FRAME_EPSILON) - 1);
  const frameMid = (frame + 0.5) / fps;
  if (frameMid >= kept.start && frameMid < kept.end) return clamp(frameMid, 0, duration);
  const lo = Math.max(kept.start, frame / fps);
  const hi = Math.min(kept.end, (frame + 1) / fps);
  return clamp((lo + hi) / 2, 0, duration);
}
