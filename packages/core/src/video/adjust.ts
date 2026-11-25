/**
 * Video adjustments beyond the timeline: tool trays, rotate and flip, speed, volume and fades,
 * plus the audio math export and preview share (gain envelope, soft clip, time scaling). Pure.
 */
import { rotateRectCw } from "../image/geometry";
import { clamp, pushHistory } from "../operations";
import type {
  HistoryStack,
  ImageRotation,
  VideoCropAspect,
  VideoDocumentState,
  VideoExportFormat,
  VideoSegment,
  VideoTool,
} from "../types";
import type { FrameSize } from "./crop";

export const VIDEO_SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const VIDEO_FADE_PRESETS = [0, 0.5, 1, 2] as const;

export const MIN_VIDEO_SPEED = 0.25;
export const MAX_VIDEO_SPEED = 4;
export const MAX_VIDEO_VOLUME = 2;
export const MAX_VIDEO_FADE = 5;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clampVideoSpeed(speed: number): number {
  return clamp(finiteOr(speed, 1), MIN_VIDEO_SPEED, MAX_VIDEO_SPEED);
}

export function clampVideoVolume(volume: number): number {
  return clamp(finiteOr(volume, 1), 0, MAX_VIDEO_VOLUME);
}

export function clampVideoFade(seconds: number): number {
  return clamp(finiteOr(seconds, 0), 0, MAX_VIDEO_FADE);
}

/** Opens `tool`'s tray, or closes it when it is already open. */
export function toggleVideoTool(state: VideoDocumentState, tool: VideoTool): VideoDocumentState {
  return { ...state, tool: state.tool === tool ? "none" : tool };
}

export function setVideoSpeed(state: VideoDocumentState, speed: number): VideoDocumentState {
  const next = clampVideoSpeed(speed);
  return next === state.speed ? state : { ...state, speed: next };
}

export function setVideoVolume(state: VideoDocumentState, volume: number): VideoDocumentState {
  const next = clampVideoVolume(volume);
  return next === state.volume ? state : { ...state, volume: next };
}

export function setVideoFade(
  state: VideoDocumentState,
  edge: "in" | "out",
  seconds: number,
): VideoDocumentState {
  const next = clampVideoFade(seconds);
  if (edge === "in") return next === state.fadeIn ? state : { ...state, fadeIn: next };
  return next === state.fadeOut ? state : { ...state, fadeOut: next };
}

/** Frame size after the turn: 90° and 270° swap width and height. Crops live in this frame. */
export function orientedFrameSize(frame: FrameSize, rotation: ImageRotation): FrameSize {
  return rotation === 90 || rotation === 270 ? { width: frame.height, height: frame.width } : frame;
}

const NEXT_CW: Readonly<Record<ImageRotation, ImageRotation>> = {
  0: 90,
  90: 180,
  180: 270,
  270: 0,
};
const NEXT_CCW: Readonly<Record<ImageRotation, ImageRotation>> = {
  0: 270,
  90: 0,
  180: 90,
  270: 180,
};

/** The preset that keeps the same pixels after a quarter turn; 4:5 has no turned preset. */
function turnAspect(aspect: VideoCropAspect): VideoCropAspect {
  switch (aspect) {
    case "16:9":
      return "9:16";
    case "9:16":
      return "16:9";
    case "free":
    case "1:1":
      return aspect;
    case "4:5":
      return "free";
    default: {
      const _exhaustive: never = aspect;
      return _exhaustive;
    }
  }
}

/**
 * Turns the picture 90° clockwise as the viewer sees it; the crop turns with it. The flip is
 * applied after the turn, so on a mirrored picture a visible clockwise turn is a
 * counter-clockwise turn of the source.
 */
export function rotateVideoCw(state: VideoDocumentState): VideoDocumentState {
  return {
    ...state,
    rotation: (state.flipX ? NEXT_CCW : NEXT_CW)[state.rotation],
    crop: rotateRectCw(state.crop),
    cropAspect: turnAspect(state.cropAspect),
  };
}

/** Mirrors the picture left to right as the viewer sees it; the crop mirrors with it. */
export function flipVideoX(state: VideoDocumentState): VideoDocumentState {
  return {
    ...state,
    flipX: !state.flipX,
    crop: { ...state.crop, x: 1 - state.crop.x - state.crop.width },
  };
}

// ---------------------------------------------------------------------------
// Per-clip speed, volume and mute

/** The speed a segment plays at: its own override, else the document's. */
export function effectiveSegmentSpeed(
  segment: VideoSegment,
  doc: Pick<VideoDocumentState, "speed">,
): number {
  return clampVideoSpeed(segment.speed ?? doc.speed);
}

/** The gain a segment plays at (before mute and fades): its own override, else the document's. */
export function effectiveSegmentVolume(
  segment: VideoSegment,
  doc: Pick<VideoDocumentState, "volume">,
): number {
  return clampVideoVolume(segment.volume ?? doc.volume);
}

/** Whether a segment is silent: its own override, else the document's mute. */
export function effectiveSegmentMuted(
  segment: VideoSegment,
  doc: Pick<VideoDocumentState, "muted">,
): boolean {
  return segment.muted ?? doc.muted;
}

/** Whether a segment overrides any of the document's speed, volume or mute. */
export function hasSegmentOverrides(segment: VideoSegment): boolean {
  return segment.speed !== undefined || segment.volume !== undefined || segment.muted !== undefined;
}

/**
 * What a speed, volume or mute edit applies to: one clip (an override on that segment), or the
 * whole video (the document's value, with every clip's override of that field cleared, so "All"
 * applies everywhere).
 */
export type VideoAdjustTarget =
  | { readonly kind: "all" }
  | { readonly kind: "segment"; readonly id: string };

type OverrideKey = "speed" | "volume" | "muted";

function clearOverride(segment: VideoSegment, key: OverrideKey): VideoSegment {
  switch (key) {
    case "speed": {
      const { speed: _speed, ...rest } = segment;
      return rest;
    }
    case "volume": {
      const { volume: _volume, ...rest } = segment;
      return rest;
    }
    case "muted": {
      const { muted: _muted, ...rest } = segment;
      return rest;
    }
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

/**
 * Sets `key` on the target segment. A value equal to the document's is stored as no override, so
 * the clip inherits again and shows no badge. Returns `state` unchanged when nothing moves.
 */
function setSegmentOverride<K extends OverrideKey>(
  state: VideoDocumentState,
  id: string,
  key: K,
  value: VideoDocumentState[K],
): VideoDocumentState {
  const index = state.segments.findIndex((s) => s.id === id);
  const segment = state.segments[index];
  if (segment === undefined) return state;
  const inherits = Object.is(value, state[key]);
  if (inherits ? segment[key] === undefined : Object.is(segment[key], value)) return state;
  const cleared = clearOverride(segment, key);
  const next: VideoSegment = inherits ? cleared : { ...cleared, [key]: value };
  return {
    ...state,
    segments: [...state.segments.slice(0, index), next, ...state.segments.slice(index + 1)],
  };
}

/** Sets the document's `key` and clears that override from every segment. */
function setOverrideForAll<K extends OverrideKey>(
  state: VideoDocumentState,
  key: K,
  value: VideoDocumentState[K],
): VideoDocumentState {
  const overridden = state.segments.some((s) => s[key] !== undefined);
  if (Object.is(state[key], value) && !overridden) return state;
  return {
    ...state,
    [key]: value,
    segments: overridden ? state.segments.map((s) => clearOverride(s, key)) : state.segments,
  };
}

export function setSegmentSpeed(
  state: VideoDocumentState,
  target: VideoAdjustTarget,
  speed: number,
): VideoDocumentState {
  const next = clampVideoSpeed(speed);
  return target.kind === "all"
    ? setOverrideForAll(state, "speed", next)
    : setSegmentOverride(state, target.id, "speed", next);
}

export function setSegmentVolume(
  state: VideoDocumentState,
  target: VideoAdjustTarget,
  volume: number,
): VideoDocumentState {
  const next = clampVideoVolume(volume);
  return target.kind === "all"
    ? setOverrideForAll(state, "volume", next)
    : setSegmentOverride(state, target.id, "volume", next);
}

export function setSegmentMuted(
  state: VideoDocumentState,
  target: VideoAdjustTarget,
  muted: boolean,
): VideoDocumentState {
  return target.kind === "all"
    ? setOverrideForAll(state, "muted", muted)
    : setSegmentOverride(state, target.id, "muted", muted);
}

/**
 * Whether every kept clip is silent, which is what the "All" mute button shows as "Unmute". A
 * mix of muted and audible clips counts as not muted. With no kept clip, the document's mute.
 */
export function allClipsMuted(state: Pick<VideoDocumentState, "segments" | "muted">): boolean {
  const kept = state.segments.filter((s) => !s.deleted);
  return kept.length === 0 ? state.muted : kept.every((s) => effectiveSegmentMuted(s, state));
}

/** Whether `target` reads as muted: that clip's effective mute, or `allClipsMuted`. */
export function targetMuted(state: VideoDocumentState, target: VideoAdjustTarget): boolean {
  if (target.kind === "all") return allClipsMuted(state);
  const segment = state.segments.find((s) => s.id === target.id);
  return segment === undefined ? state.muted : effectiveSegmentMuted(segment, state);
}

/**
 * The mute button's action: unmutes `target` when it reads as muted, else mutes it. On "All", a
 * mix of muted and audible clips reads as not muted, so the press mutes every clip.
 */
export function toggleTargetMuted(
  state: VideoDocumentState,
  target: VideoAdjustTarget,
): VideoDocumentState {
  return setSegmentMuted(state, target, !targetMuted(state, target));
}

/** Length of the exported video: each kept segment's length divided by its own speed. */
export function getOutputDuration(state: Pick<VideoDocumentState, "segments" | "speed">): number {
  return state.segments.reduce(
    (total, s) => (s.deleted ? total : total + (s.end - s.start) / effectiveSegmentSpeed(s, state)),
    0,
  );
}

/** Speed, volume and fades: everything that changes audio samples, not just which ones are kept. */
export type AudioAdjustments = Pick<VideoDocumentState, "speed" | "volume" | "fadeIn" | "fadeOut">;

/** Whether the audio must be decoded and rewritten (packets can't be copied). */
export function needsAudioProcessing(adjust: AudioAdjustments): boolean {
  return adjust.speed !== 1 || adjust.volume !== 1 || adjust.fadeIn > 0 || adjust.fadeOut > 0;
}

/**
 * Gain at `outputTime` on the exported timeline: `volume`, ramped linearly up from 0 over the
 * fade-in and down to 0 over the fade-out. When the fades together are longer than the clip,
 * both shrink in proportion so the ramps meet at full volume instead of jumping.
 */
export function computeAudioGainAt(args: {
  readonly outputTime: number;
  readonly outputDuration: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly fadeIn: number;
  readonly fadeOut: number;
}): number {
  if (args.muted) return 0;
  const volume = clampVideoVolume(args.volume);
  const duration = Math.max(0, finiteOr(args.outputDuration, 0));
  let fadeIn = clampVideoFade(args.fadeIn);
  let fadeOut = clampVideoFade(args.fadeOut);
  const total = fadeIn + fadeOut;
  if (total > 0 && duration <= 0) return 0;
  if (total > duration) {
    const scale = duration / total;
    fadeIn *= scale;
    fadeOut *= scale;
  }
  const t = clamp(finiteOr(args.outputTime, 0), 0, duration);
  let envelope = 1;
  if (fadeIn > 0) envelope = Math.min(envelope, t / fadeIn);
  if (fadeOut > 0) envelope = Math.min(envelope, (duration - t) / fadeOut);
  return volume * clamp(envelope, 0, 1);
}

const CLIP_KNEE = 0.9;

/**
 * Keeps a sample inside [-1, 1]. Values up to the 0.9 knee pass unchanged; louder ones bend
 * smoothly toward 1 instead of clipping hard, so 200% volume distorts gently.
 */
export function softClipSample(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= CLIP_KNEE) return value;
  const headroom = 1 - CLIP_KNEE;
  const bent = CLIP_KNEE + headroom * Math.tanh((magnitude - CLIP_KNEE) / headroom);
  return Math.sign(value) * bent;
}

/** Output frame count for `inputFrames` played at `speed`. */
export function timeScaledFrameCount(inputFrames: number, speed: number): number {
  return Math.max(0, Math.round(inputFrames / clampVideoSpeed(speed)));
}

/**
 * Resamples one channel so it plays `speed` times faster (pitch follows, like tape). Output
 * frame `i` reads the input at `i * speed` with linear interpolation; reads past the end hold
 * the last sample.
 */
export function timeScaleChannel(input: Float32Array, speed: number): Float32Array {
  const rate = clampVideoSpeed(speed);
  const out = new Float32Array(timeScaledFrameCount(input.length, rate));
  const last = input.length - 1;
  if (last < 0) return out;
  for (let i = 0; i < out.length; i++) {
    const position = Math.min(i * rate, last);
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input[index] ?? 0;
    const b = input[Math.min(index + 1, last)] ?? a;
    out[i] = a + (b - a) * fraction;
  }
  return out;
}

type DocumentField = Exclude<keyof VideoDocumentState, "tool">;

/** Every field except `tool`. The check below fails to compile when a new field is left out. */
const DOCUMENT_FIELDS = [
  "duration",
  "segments",
  "crop",
  "cropEnabled",
  "cropAspect",
  "rotation",
  "flipX",
  "speed",
  "volume",
  "muted",
  "fadeIn",
  "fadeOut",
  "exportFormat",
] as const satisfies readonly DocumentField[];

const _allFieldsListed: [Exclude<DocumentField, (typeof DOCUMENT_FIELDS)[number]>] extends [never]
  ? true
  : never = true;
void _allFieldsListed;

function documentChanged(a: VideoDocumentState, b: VideoDocumentState): boolean {
  return DOCUMENT_FIELDS.some((key) => !Object.is(a[key], b[key]));
}

export type VideoHistory = HistoryStack<VideoDocumentState>;

/** Records `next`: an undo step when document fields changed, an in-place update for a tool switch. */
export function commitVideoState(history: VideoHistory, next: VideoDocumentState): VideoHistory {
  if (next === history.present) return history;
  if (!documentChanged(history.present, next)) return { ...history, present: next };
  return pushHistory(history, next);
}

/**
 * Makes `format` the export format of every step without an undo step of its own, for a format
 * the export switched to by itself. Undo and redo keep every real edit; a step that only changed
 * the format, and now matches its neighbor, is dropped so undo never lands on a no-op.
 */
export function setVideoExportFormatEverywhere(
  history: VideoHistory,
  format: VideoExportFormat,
): VideoHistory {
  const withFormat = (state: VideoDocumentState): VideoDocumentState =>
    state.exportFormat === format ? state : { ...state, exportFormat: format };
  const present = withFormat(history.present);
  /** Steps walking away from the present, without the ones that equal the step before them. */
  const distinct = (steps: readonly VideoDocumentState[]): VideoDocumentState[] => {
    const kept: VideoDocumentState[] = [];
    let last = present;
    for (const step of steps.map(withFormat)) {
      if (!documentChanged(last, step)) continue;
      kept.push(step);
      last = step;
    }
    return kept;
  };
  return {
    past: distinct(history.past.toReversed()).toReversed(),
    present,
    future: distinct(history.future),
  };
}

/** Undo and redo keep the open tray: switching tools is not an edit. */
export function keepVideoTool(from: VideoHistory, to: VideoHistory): VideoHistory {
  if (to === from || to.present.tool === from.present.tool) return to;
  return { ...to, present: { ...to.present, tool: from.present.tool } };
}
