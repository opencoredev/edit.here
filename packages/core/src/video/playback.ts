/** J/K/L shuttle, frame stepping and timecodes for the video editor. Pure; no DOM. */
import { clamp } from "../operations";

/** Shuttle speeds, slowest first. Repeating J or L steps through them. */
export const SHUTTLE_SPEEDS = [1, 2, 4, 8] as const;

export type ShuttleSpeed = (typeof SHUTTLE_SPEEDS)[number];

export type ShuttleState =
  | { readonly kind: "paused" }
  | {
      readonly kind: "playing";
      readonly direction: "forward" | "backward";
      readonly speed: ShuttleSpeed;
    };

export type ShuttleKey = "j" | "k" | "l";

export const SHUTTLE_PAUSED: ShuttleState = { kind: "paused" };

function faster(speed: ShuttleSpeed): ShuttleSpeed {
  const index = SHUTTLE_SPEEDS.indexOf(speed);
  return SHUTTLE_SPEEDS[Math.min(index + 1, SHUTTLE_SPEEDS.length - 1)] ?? speed;
}

/**
 * Next shuttle state for a key. K pauses. L plays forward and speeds up on repeat (1, 2, 4, 8×);
 * J does the same backward. Pressing the opposite direction while shuttling switches to 1× in
 * that direction.
 */
export function nextShuttle(state: ShuttleState, key: ShuttleKey): ShuttleState {
  if (key === "k") return SHUTTLE_PAUSED;
  const direction = key === "l" ? "forward" : "backward";
  if (state.kind === "playing" && state.direction === direction) {
    return { kind: "playing", direction, speed: faster(state.speed) };
  }
  return { kind: "playing", direction, speed: 1 };
}

/** Signed playback rate for a shuttle state: 0 when paused, negative when backward. */
export function shuttleRate(state: ShuttleState): number {
  if (state.kind === "paused") return 0;
  return state.direction === "forward" ? state.speed : -state.speed;
}

/** Frame rate used when the container doesn't report one. */
export const DEFAULT_FRAME_RATE = 30;

/** Returns a usable frame rate: finite, between 1 and 240, else the default. */
export function normalizeFrameRate(rate: number | null | undefined): number {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 1 || rate > 240) {
    return DEFAULT_FRAME_RATE;
  }
  return rate;
}

/** Index of the frame shown at `time` (frames start at `index / fps`). */
export function frameIndexAt(time: number, fps: number): number {
  // The small bias absorbs float noise such as 0.1 * 30 = 2.9999999999999996.
  return Math.floor(Math.max(0, time) * fps + 1e-6);
}

/** Snaps a time to the start of the frame it falls in. */
export function snapToFrame(time: number, fps: number): number {
  return frameIndexAt(time, fps) / fps;
}

/**
 * Moves one frame forward or back from `time`. The result is the frame's midpoint, which seeks
 * reliably in browsers (seeking exactly to a frame boundary can land on the previous frame).
 */
export function stepFrame(args: {
  readonly time: number;
  readonly fps: number;
  readonly direction: 1 | -1;
  readonly duration: number;
}): number {
  const { fps, duration } = args;
  const lastFrame = Math.max(0, Math.ceil(duration * fps - 1e-6) - 1);
  const target = clamp(frameIndexAt(args.time, fps) + args.direction, 0, lastFrame);
  return Math.min(duration, (target + 0.5) / fps);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `MM:SS:FF` (or `H:MM:SS:FF` past an hour) for a time in seconds. */
export function formatTimecode(seconds: number, fps: number): string {
  const rate = Math.max(1, Math.round(fps));
  const totalFrames = frameIndexAt(seconds, rate);
  const frames = totalFrames % rate;
  const totalSeconds = Math.floor(totalFrames / rate);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  const head = hh > 0 ? `${hh}:${pad(mm)}` : pad(mm);
  return `${head}:${pad(ss)}:${pad(frames)}`;
}

/** Short human duration for labels, e.g. `3.4s` or `1:05`. */
export function formatDurationLabel(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe < 60) return `${safe.toFixed(1)}s`;
  const whole = Math.round(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Evenly spaced timestamps for filmstrip thumbnails, one per tile center, clamped inside
 * `[0, duration)` so the decoder always has a frame for each.
 */
export function filmstripTimestamps(args: {
  readonly duration: number;
  readonly count: number;
}): readonly number[] {
  const count = Math.max(0, Math.floor(args.count));
  if (count === 0 || args.duration <= 0) return [];
  const step = args.duration / count;
  return Array.from({ length: count }, (_, i) =>
    Math.min(args.duration - 1e-3, Math.max(0, (i + 0.5) * step)),
  );
}
