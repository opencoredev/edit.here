/**
 * Pure, immutable document operations. Every function returns a new value and never mutates
 * its input. Functions that create entities take the new id as an argument so they stay pure.
 */
import { canvasBackgroundCss, type CanvasBackground, type MeshBlob } from "./image/background";
import type {
  AnnotationStyle,
  BackgroundPreset,
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
  preset: "dusk",
  customMode: "gradient",
  customColor: "#6366f1",
  customColorEnd: "#ec4899",
  customAngle: 135,
  padding: 64,
  radius: 16,
  shadow: true,
};

/** A preset background: its tray label and what it paints. */
export type BackgroundPresetDefinition = {
  readonly label: string;
  readonly background: CanvasBackground;
};

function mesh(label: string, base: string, blobs: readonly MeshBlob[]): BackgroundPresetDefinition {
  return { label, background: { kind: "mesh", base, blobs } };
}

/**
 * Soft wallpaper-like meshes, all drawn in code. Blobs sit near the edges, where the frame
 * padding shows them. `custom` resolves from the `FrameConfig.custom*` fields.
 */
export const BACKGROUND_PRESETS: Readonly<
  Record<Exclude<BackgroundPreset, "custom">, BackgroundPresetDefinition>
> = {
  none: { label: "None", background: { kind: "solid", color: "transparent" } },
  dusk: mesh("Dusk", "#212759", [
    { x: 0.06, y: 0.06, rx: 0.88, ry: 0.74, color: "#5c78ee", opacity: 0.88 },
    { x: 0.94, y: 0.16, rx: 0.86, ry: 0.78, color: "#c95ca4", opacity: 0.84 },
    { x: 0.96, y: 0.9, rx: 0.82, ry: 0.74, color: "#f5a382", opacity: 0.84 },
    { x: 0.06, y: 0.94, rx: 0.76, ry: 0.68, color: "#3f358f", opacity: 0.74 },
  ]),
  azure: mesh("Azure", "#1a4280", [
    { x: 0.06, y: 0.1, rx: 0.9, ry: 0.74, color: "#4da3f5", opacity: 0.9 },
    { x: 0.12, y: 0.96, rx: 0.84, ry: 0.7, color: "#5cd2e8", opacity: 0.8 },
    { x: 0.94, y: 0.06, rx: 0.78, ry: 0.68, color: "#b4ccff", opacity: 0.78 },
    { x: 0.94, y: 0.94, rx: 0.76, ry: 0.72, color: "#1d3878", opacity: 0.72 },
  ]),
  lagoon: mesh("Lagoon", "#0f3a44", [
    { x: 0.06, y: 0.08, rx: 0.86, ry: 0.72, color: "#2e82bc", opacity: 0.82 },
    { x: 0.94, y: 0.12, rx: 0.88, ry: 0.76, color: "#2bc4b2", opacity: 0.86 },
    { x: 0.1, y: 0.94, rx: 0.84, ry: 0.7, color: "#65d9b0", opacity: 0.8 },
    { x: 0.94, y: 0.94, rx: 0.72, ry: 0.7, color: "#0c2f3b", opacity: 0.72 },
  ]),
  canopy: mesh("Canopy", "#173c30", [
    { x: 0.06, y: 0.12, rx: 0.88, ry: 0.76, color: "#5ca678", opacity: 0.88 },
    { x: 0.96, y: 0.06, rx: 0.86, ry: 0.7, color: "#dbe094", opacity: 0.76 },
    { x: 0.92, y: 0.92, rx: 0.82, ry: 0.74, color: "#1f6f65", opacity: 0.82 },
    { x: 0.1, y: 0.94, rx: 0.78, ry: 0.66, color: "#438a5e", opacity: 0.76 },
  ]),
  solstice: mesh("Solstice", "#54213d", [
    { x: 0.06, y: 0.94, rx: 0.84, ry: 0.74, color: "#7b2d68", opacity: 0.84 },
    { x: 0.96, y: 0.74, rx: 0.88, ry: 0.8, color: "#e85d75", opacity: 0.86 },
    { x: 0.06, y: 0.08, rx: 0.88, ry: 0.76, color: "#f79552", opacity: 0.9 },
    { x: 0.62, y: 0.04, rx: 0.78, ry: 0.6, color: "#ffcf94", opacity: 0.72 },
  ]),
  orchid: mesh("Orchid", "#2c1238", [
    { x: 0.06, y: 0.1, rx: 0.86, ry: 0.76, color: "#823ec4", opacity: 0.86 },
    { x: 0.94, y: 0.18, rx: 0.88, ry: 0.78, color: "#df4f8e", opacity: 0.88 },
    { x: 0.96, y: 0.9, rx: 0.82, ry: 0.72, color: "#f59ebc", opacity: 0.8 },
    { x: 0.08, y: 0.94, rx: 0.78, ry: 0.7, color: "#4f1e6b", opacity: 0.8 },
  ]),
  midnight: mesh("Midnight", "#0a0f20", [
    { x: 0.1, y: 0.08, rx: 0.88, ry: 0.74, color: "#233e7a", opacity: 0.88 },
    { x: 0.92, y: 0.88, rx: 0.82, ry: 0.74, color: "#372c6b", opacity: 0.82 },
    { x: 0.9, y: 0.1, rx: 0.72, ry: 0.6, color: "#3d5c99", opacity: 0.58 },
  ]),
  graphite: mesh("Graphite", "#111318", [
    { x: 0.22, y: 0.04, rx: 0.9, ry: 0.68, color: "#37404f", opacity: 0.84 },
    { x: 0.92, y: 0.92, rx: 0.8, ry: 0.72, color: "#282e3b", opacity: 0.8 },
    { x: 0.86, y: 0.1, rx: 0.68, ry: 0.58, color: "#465063", opacity: 0.48 },
  ]),
  mist: mesh("Mist", "#d6e0ee", [
    { x: 0.08, y: 0.92, rx: 0.86, ry: 0.74, color: "#b3ccf0", opacity: 0.86 },
    { x: 0.94, y: 0.16, rx: 0.84, ry: 0.74, color: "#cfcfeb", opacity: 0.82 },
    { x: 0.1, y: 0.06, rx: 0.78, ry: 0.64, color: "#eff4fa", opacity: 0.78 },
    { x: 0.92, y: 0.94, rx: 0.74, ry: 0.68, color: "#bbc8de", opacity: 0.72 },
  ]),
  linen: mesh("Linen", "#e0d7ca", [
    { x: 0.08, y: 0.92, rx: 0.86, ry: 0.74, color: "#e3c4b8", opacity: 0.84 },
    { x: 0.94, y: 0.12, rx: 0.84, ry: 0.72, color: "#eed0b2", opacity: 0.84 },
    { x: 0.1, y: 0.08, rx: 0.76, ry: 0.64, color: "#f4ede2", opacity: 0.8 },
    { x: 0.92, y: 0.94, rx: 0.74, ry: 0.68, color: "#ccbba6", opacity: 0.72 },
  ]),
};

/** The custom background: the solid color, or a two-stop gradient at its angle. */
export function customBackground(
  frame: Pick<FrameConfig, "customMode" | "customColor" | "customColorEnd" | "customAngle">,
): CanvasBackground {
  switch (frame.customMode) {
    case "solid":
      return { kind: "solid", color: frame.customColor };
    case "gradient":
      return {
        kind: "linear",
        angle: frame.customAngle,
        stops: [
          { offset: 0, color: frame.customColor },
          { offset: 1, color: frame.customColorEnd },
        ],
      };
    default: {
      const _exhaustive: never = frame.customMode;
      return _exhaustive;
    }
  }
}

export function frameBackground(frame: FrameConfig): CanvasBackground {
  return frame.preset === "custom"
    ? customBackground(frame)
    : BACKGROUND_PRESETS[frame.preset].background;
}

export function frameBackgroundCss(frame: FrameConfig): string {
  return canvasBackgroundCss(frameBackground(frame));
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
