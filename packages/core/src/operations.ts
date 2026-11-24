/**
 * Pure, immutable document operations. Every function returns a new value and never mutates
 * its input. Functions that create entities take the new id as an argument so they stay pure.
 */
import type {
  AnnotationStyle,
  FrameConfig,
  HistoryStack,
  ImageDocumentState,
  ImageRotation,
  NormalizedRect,
  RedactionBox,
  RedactionStyle,
  VideoDocumentState,
  VideoSegment,
} from "./types";

// ---------------------------------------------------------------------------
// History

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): HistoryStack<T> {
  return { past: [], present, future: [] };
}

/** Records `next` as the new present. A value identical to the present is ignored. */
export function pushHistory<T>(
  history: HistoryStack<T>,
  next: T,
  limit: number = HISTORY_LIMIT,
): HistoryStack<T> {
  if (Object.is(next, history.present)) return history;
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
}

export function undoHistory<T>(history: HistoryStack<T>): HistoryStack<T> {
  const previous = history.past.at(-1);
  if (history.past.length === 0 || previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: HistoryStack<T>): HistoryStack<T> {
  const [next, ...rest] = history.future;
  if (history.future.length === 0 || next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export function canUndo<T>(history: HistoryStack<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: HistoryStack<T>): boolean {
  return history.future.length > 0;
}

// ---------------------------------------------------------------------------
// Geometry

export const FULL_RECT: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };

/** Smallest normalized edge a rect may have, so a crop or redaction never collapses. */
export const MIN_RECT_SIZE = 0.01;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalizes negative sizes (drag from bottom-right to top-left), then keeps the rect inside
 * the unit square with at least `minSize` on each edge.
 */
export function clampNormalizedRect(
  rect: NormalizedRect,
  minSize: number = MIN_RECT_SIZE,
): NormalizedRect {
  const left = Math.min(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const width = clamp(Math.abs(rect.width), minSize, 1);
  const height = clamp(Math.abs(rect.height), minSize, 1);
  return {
    x: clamp(left, 0, 1 - width),
    y: clamp(top, 0, 1 - height),
    width,
    height,
  };
}

export function isFullRect(rect: NormalizedRect): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1;
}

// ---------------------------------------------------------------------------
// Redactions

export const DEFAULT_REDACTION_INTENSITY = 0.6;

export function createRedaction(args: {
  readonly id: string;
  readonly rect: NormalizedRect;
  readonly style: RedactionStyle;
  readonly intensity?: number;
}): RedactionBox {
  return {
    id: args.id,
    rect: clampNormalizedRect(args.rect),
    style: args.style,
    intensity: clamp(args.intensity ?? DEFAULT_REDACTION_INTENSITY, 0, 1),
  };
}

export function addRedaction(
  redactions: readonly RedactionBox[],
  redaction: RedactionBox,
): readonly RedactionBox[] {
  return [...redactions.filter((r) => r.id !== redaction.id), redaction];
}

export function updateRedaction(
  redactions: readonly RedactionBox[],
  id: string,
  patch: Partial<Omit<RedactionBox, "id">>,
): readonly RedactionBox[] {
  return redactions.map((r) =>
    r.id === id
      ? createRedaction({
          id,
          rect: patch.rect ?? r.rect,
          style: patch.style ?? r.style,
          intensity: patch.intensity ?? r.intensity,
        })
      : r,
  );
}

export function removeRedaction(
  redactions: readonly RedactionBox[],
  id: string,
): readonly RedactionBox[] {
  return redactions.filter((r) => r.id !== id);
}

// ---------------------------------------------------------------------------
// Image

/** Red, medium stroke: reads on light and dark screenshots alike. */
export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = { color: "#ff3b30", size: 0.005 };

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  enabled: false,
  preset: "hyper",
  customMode: "gradient",
  customColor: "#6366f1",
  customColorEnd: "#ec4899",
  customAngle: 135,
  padding: 64,
  radius: 16,
  shadow: true,
};

/** CSS backgrounds for each frame preset. `custom` resolves from the `FrameConfig.custom*` fields. */
export const BACKGROUND_PRESETS: Readonly<
  Record<Exclude<FrameConfig["preset"], "custom">, { readonly label: string; readonly css: string }>
> = {
  none: { label: "None", css: "transparent" },
  hyper: {
    label: "Hyper",
    css: "linear-gradient(135deg, #4f46e5 0%, #2563eb 52%, #06b6d4 100%)",
  },
  ember: {
    label: "Ember",
    css: "linear-gradient(135deg, #fb923c 0%, #f43f5e 52%, #9333ea 100%)",
  },
  mojave: {
    label: "Mojave",
    css: "linear-gradient(135deg, #f59e0b 0%, #ec4899 55%, #6366f1 100%)",
  },
  emerald: {
    label: "Emerald",
    css: "linear-gradient(135deg, #0f766e 0%, #10b981 50%, #0ea5e9 100%)",
  },
  iris: {
    label: "Iris",
    css: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #f472b6 100%)",
  },
  obsidian: {
    label: "Obsidian",
    css: "linear-gradient(135deg, #27272a 0%, #18181b 55%, #09090b 100%)",
  },
  silver: {
    label: "Silver",
    css: "linear-gradient(145deg, #ffffff 0%, #e4e4e7 55%, #d4d4d8 100%)",
  },
  paper: { label: "Paper", css: "linear-gradient(145deg, #faf7f2 0%, #ece6dc 100%)" },
};

/** The custom background as CSS: the solid color, or a two-stop gradient at its angle. */
export function customBackgroundCss(
  frame: Pick<FrameConfig, "customMode" | "customColor" | "customColorEnd" | "customAngle">,
): string {
  switch (frame.customMode) {
    case "solid":
      return frame.customColor;
    case "gradient":
      return `linear-gradient(${frame.customAngle}deg, ${frame.customColor} 0%, ${frame.customColorEnd} 100%)`;
    default: {
      const _exhaustive: never = frame.customMode;
      return _exhaustive;
    }
  }
}

export function frameBackgroundCss(frame: FrameConfig): string {
  return frame.preset === "custom"
    ? customBackgroundCss(frame)
    : BACKGROUND_PRESETS[frame.preset].css;
}

export function createInitialImageState(): ImageDocumentState {
  return {
    tool: "select",
    crop: FULL_RECT,
    rotation: 0,
    flipX: false,
    redactions: [],
    selectedRedactionId: null,
    redactionStyle: "pixelate",
    annotations: [],
    selectedAnnotationId: null,
    annotationStyle: DEFAULT_ANNOTATION_STYLE,
    frame: DEFAULT_FRAME_CONFIG,
    transparent: false,
    exportFormat: "image/png",
  };
}

export function rotateImage(state: ImageDocumentState): ImageDocumentState {
  const next: Record<ImageRotation, ImageRotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };
  return { ...state, rotation: next[state.rotation] };
}

export function flipImage(state: ImageDocumentState): ImageDocumentState {
  return { ...state, flipX: !state.flipX };
}

export function setImageCrop(state: ImageDocumentState, crop: NormalizedRect): ImageDocumentState {
  return { ...state, crop: clampNormalizedRect(crop) };
}

export function addImageRedaction(
  state: ImageDocumentState,
  redaction: RedactionBox,
): ImageDocumentState {
  return {
    ...state,
    redactions: addRedaction(state.redactions, redaction),
    selectedRedactionId: redaction.id,
  };
}

export function removeImageRedaction(state: ImageDocumentState, id: string): ImageDocumentState {
  return {
    ...state,
    redactions: removeRedaction(state.redactions, id),
    selectedRedactionId: state.selectedRedactionId === id ? null : state.selectedRedactionId,
  };
}

export function updateImageFrame(
  state: ImageDocumentState,
  patch: Partial<FrameConfig>,
): ImageDocumentState {
  const frame: FrameConfig = {
    ...state.frame,
    ...patch,
    padding: clamp(patch.padding ?? state.frame.padding, 0, 512),
    radius: clamp(patch.radius ?? state.frame.radius, 0, 256),
  };
  return { ...state, frame };
}

/** Resets geometry (crop, rotation, flip) and keeps redactions and frame settings. */
export function resetImageTransform(state: ImageDocumentState): ImageDocumentState {
  return { ...state, crop: FULL_RECT, rotation: 0, flipX: false };
}

// ---------------------------------------------------------------------------
// Video

/** Splits closer than this to a segment edge are ignored (seconds). */
export const MIN_SEGMENT_DURATION = 0.05;

/**
 * `MIN_SEGMENT_DURATION` less float slack, for "is this segment long enough" checks. Frame times
 * come from division, so a 50 ms gap can subtract to 0.04999999999999982 (3.5 - 3.45); a hard
 * `< MIN_SEGMENT_DURATION` would reject it.
 */
export const MIN_SEGMENT_SPAN = MIN_SEGMENT_DURATION - 1e-6;

export function createInitialVideoSegments(args: {
  readonly duration: number;
  readonly id?: string;
}): readonly VideoSegment[] {
  const duration = Math.max(0, args.duration);
  return [{ id: args.id ?? "seg-0", start: 0, end: duration, deleted: false }];
}

export function createInitialVideoState(duration: number): VideoDocumentState {
  return {
    tool: "none",
    duration: Math.max(0, duration),
    segments: createInitialVideoSegments({ duration }),
    crop: FULL_RECT,
    cropEnabled: false,
    cropAspect: "free",
    rotation: 0,
    flipX: false,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    exportFormat: "mp4",
  };
}

export function findSegmentAt(
  segments: readonly VideoSegment[],
  time: number,
): VideoSegment | undefined {
  return segments.find((s) => time >= s.start && time < s.end) ?? segments.at(-1);
}

/**
 * Splits the segment containing `time` into two. The left half keeps the original id; the
 * right half gets `newId`. Splits within `MIN_SEGMENT_DURATION` of an edge are no-ops.
 */
export function splitVideoAtTime(args: {
  readonly segments: readonly VideoSegment[];
  readonly time: number;
  readonly newId: string;
}): readonly VideoSegment[] {
  const { segments, time, newId } = args;
  const index = segments.findIndex((s) => time > s.start && time < s.end);
  const target = segments[index];
  if (target === undefined) return segments;
  if (time - target.start < MIN_SEGMENT_SPAN || target.end - time < MIN_SEGMENT_SPAN) {
    return segments;
  }
  const left: VideoSegment = { ...target, end: time };
  const right: VideoSegment = { ...target, id: newId, start: time };
  return [...segments.slice(0, index), left, right, ...segments.slice(index + 1)];
}

/**
 * Sets the in and out points: splits at both bounds and deletes everything outside them.
 * Deletions inside the bounds are preserved. Bounds are clamped to the timeline.
 */
export function setVideoTrimBounds(args: {
  readonly segments: readonly VideoSegment[];
  readonly start: number;
  readonly end: number;
  readonly newIds: readonly [string, string];
}): readonly VideoSegment[] {
  const duration = args.segments.at(-1)?.end ?? 0;
  const start = clamp(Math.min(args.start, args.end), 0, duration);
  const end = clamp(Math.max(args.start, args.end), 0, duration);
  if (end - start < MIN_SEGMENT_SPAN) return args.segments;
  const [startId, endId] = args.newIds;
  const withStart = splitVideoAtTime({ segments: args.segments, time: start, newId: startId });
  const withBoth = splitVideoAtTime({ segments: withStart, time: end, newId: endId });
  return withBoth.map((s) => {
    const outside = s.end <= start + 1e-9 || s.start >= end - 1e-9;
    return outside ? { ...s, deleted: true } : s;
  });
}

export function toggleDeleteVideoSegment(
  segments: readonly VideoSegment[],
  id: string,
): readonly VideoSegment[] {
  return segments.map((s) => (s.id === id ? { ...s, deleted: !s.deleted } : s));
}

/** Restores every deleted segment and merges nothing; splits stay so they can be re-cut. */
export function restoreAllVideoSegments(
  segments: readonly VideoSegment[],
): readonly VideoSegment[] {
  return segments.map((s) => (s.deleted ? { ...s, deleted: false } : s));
}

export function getKeptSegments(segments: readonly VideoSegment[]): readonly VideoSegment[] {
  return segments.filter((s) => !s.deleted);
}

export function getKeptVideoDuration(segments: readonly VideoSegment[]): number {
  return getKeptSegments(segments).reduce((total, s) => total + (s.end - s.start), 0);
}

/** Maps a source time to the next kept time, so playback can skip deleted segments. */
export function nextKeptTime(segments: readonly VideoSegment[], time: number): number | null {
  for (const s of segments) {
    if (s.deleted) continue;
    if (time < s.start) return s.start;
    if (time >= s.start && time < s.end) return time;
  }
  return null;
}
