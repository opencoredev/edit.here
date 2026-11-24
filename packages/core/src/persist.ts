/**
 * Parsers for editor state read back from local storage after a reload. Stored state is
 * untrusted: it may come from an older build with a different shape, or be cut short by a full
 * disk. Each parser returns the typed state, or null when anything is off, and the editor then
 * starts fresh instead of crashing.
 */
import { Option, Schema } from "effect";
import { clampNormalizedRect, createInitialVideoState, FULL_RECT } from "./operations";
import { clampVideoFade, clampVideoSpeed, clampVideoVolume } from "./video/adjust";
import type {
  ImageAnnotation,
  ImageDocumentState,
  VideoDocumentState,
  VideoSegment,
} from "./types";

const Finite = Schema.Finite;

const Rect = Schema.Struct({
  x: Finite,
  y: Finite,
  width: Finite,
  height: Finite,
});

const Point = Schema.Struct({ x: Finite, y: Finite });

const RedactionStyleSchema = Schema.Literals(["blackout", "blur", "pixelate"]);

const RedactionBoxSchema = Schema.Struct({
  id: Schema.String,
  rect: Rect,
  style: RedactionStyleSchema,
  intensity: Finite,
});

const StrokeFields = { id: Schema.String, color: Schema.String, size: Finite };

const AnnotationSchema = Schema.Union([
  Schema.Struct({
    ...StrokeFields,
    kind: Schema.Literals(["pen", "highlighter"]),
    points: Schema.NonEmptyArray(Point),
  }),
  Schema.Struct({ ...StrokeFields, kind: Schema.Literal("arrow"), from: Point, to: Point }),
  Schema.Struct({ ...StrokeFields, kind: Schema.Literal("rectangle"), rect: Rect }),
  Schema.Struct({ ...StrokeFields, kind: Schema.Literal("text"), at: Point, text: Schema.String }),
  Schema.Struct({
    id: Schema.String,
    kind: Schema.Literal("image"),
    assetId: Schema.String,
    rect: Rect,
    naturalWidth: Finite,
    naturalHeight: Finite,
    radius: Finite,
    // Added with layer cropping; older saves leave it out.
    crop: Schema.optionalKey(Rect),
  }),
]);

const FrameSchema = Schema.Struct({
  enabled: Schema.Boolean,
  preset: Schema.Literals([
    "none",
    "hyper",
    "ember",
    "mojave",
    "emerald",
    "iris",
    "obsidian",
    "silver",
    "paper",
    "custom",
  ]),
  customMode: Schema.Literals(["solid", "gradient"]),
  customColor: Schema.String,
  customColorEnd: Schema.String,
  customAngle: Finite,
  padding: Finite,
  radius: Finite,
  shadow: Schema.Boolean,
});

const ImageStateSchema = Schema.Struct({
  tool: Schema.Literals([
    "select",
    "pen",
    "highlighter",
    "arrow",
    "rectangle",
    "text",
    "crop",
    "redact",
    "frame",
  ]),
  crop: Rect,
  rotation: Schema.Literals([0, 90, 180, 270]),
  flipX: Schema.Boolean,
  redactions: Schema.Array(RedactionBoxSchema),
  selectedRedactionId: Schema.NullOr(Schema.String),
  redactionStyle: RedactionStyleSchema,
  annotations: Schema.Array(AnnotationSchema),
  selectedAnnotationId: Schema.NullOr(Schema.String),
  annotationStyle: Schema.Struct({ color: Schema.String, size: Finite }),
  frame: FrameSchema,
  transparent: Schema.Boolean,
  exportFormat: Schema.Literals(["image/png", "image/jpeg", "image/webp"]),
});

const decodeImageState = Schema.decodeUnknownOption(ImageStateSchema);

/**
 * A stored image document, or null. Selections that point at nothing are dropped, the crop is
 * kept inside the image, and an image layer whose picture was not stored is removed.
 */
export function parseImageDocumentState(
  input: unknown,
  assetIds: ReadonlySet<string>,
): ImageDocumentState | null {
  const decoded = decodeImageState(input);
  if (Option.isNone(decoded)) return null;
  const state: ImageDocumentState = decoded.value;
  if (state.crop.width <= 0 || state.crop.height <= 0) return null;
  const annotations = state.annotations
    .filter(
      (a) =>
        a.kind !== "image" || (assetIds.has(a.assetId) && a.rect.width > 0 && a.rect.height > 0),
    )
    .map((a): ImageAnnotation => {
      if (a.kind !== "image" || a.crop === undefined) return a;
      // A crop with no area shows nothing; fall back to the whole picture.
      return {
        ...a,
        crop: a.crop.width > 0 && a.crop.height > 0 ? clampNormalizedRect(a.crop) : FULL_RECT,
      };
    });
  return {
    ...state,
    crop: clampNormalizedRect(state.crop),
    annotations,
    selectedAnnotationId: annotations.some((a) => a.id === state.selectedAnnotationId)
      ? state.selectedAnnotationId
      : null,
    selectedRedactionId: state.redactions.some((r) => r.id === state.selectedRedactionId)
      ? state.selectedRedactionId
      : null,
  };
}

const VideoStateSchema = Schema.Struct({
  // Builds before the tool trays stored only "trim" or "crop"; both still decode.
  tool: Schema.Literals(["none", "trim", "crop", "speed", "audio"]),
  duration: Finite,
  segments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      start: Finite,
      end: Finite,
      deleted: Schema.Boolean,
      // Per-clip overrides, added later; absent means the clip inherits the document's value.
      volume: Schema.optionalKey(Finite),
      muted: Schema.optionalKey(Schema.Boolean),
      speed: Schema.optionalKey(Finite),
    }),
  ),
  crop: Rect,
  cropEnabled: Schema.Boolean,
  cropAspect: Schema.Literals(["free", "16:9", "9:16", "1:1", "4:5"]),
  muted: Schema.Boolean,
  exportFormat: Schema.Literals(["mp4", "webm"]),
  // Added with rotate, speed and audio controls; older saves leave them out.
  rotation: Schema.optionalKey(Schema.Literals([0, 90, 180, 270])),
  flipX: Schema.optionalKey(Schema.Boolean),
  speed: Schema.optionalKey(Finite),
  volume: Schema.optionalKey(Finite),
  fadeIn: Schema.optionalKey(Finite),
  fadeOut: Schema.optionalKey(Finite),
});

const decodeVideoState = Schema.decodeUnknownOption(VideoStateSchema);

/**
 * A stored video document for a video of `duration` seconds, or null. The segments must still
 * tile the whole timeline in order, so a file whose length changed starts fresh. Fields a
 * stored state lacks take their defaults, and numbers are clamped to their ranges.
 */
export function parseVideoDocumentState(
  input: unknown,
  duration: number,
): VideoDocumentState | null {
  const decoded = decodeVideoState(input);
  if (Option.isNone(decoded)) return null;
  const stored = decoded.value;
  const defaults = createInitialVideoState(duration);
  const state: VideoDocumentState = {
    tool: stored.tool,
    duration: stored.duration,
    segments: stored.segments.map((s): VideoSegment => ({
      id: s.id,
      start: s.start,
      end: s.end,
      deleted: s.deleted,
      ...(s.volume === undefined ? {} : { volume: clampVideoVolume(s.volume) }),
      ...(s.muted === undefined ? {} : { muted: s.muted }),
      ...(s.speed === undefined ? {} : { speed: clampVideoSpeed(s.speed) }),
    })),
    crop: stored.crop,
    cropEnabled: stored.cropEnabled,
    cropAspect: stored.cropAspect,
    rotation: stored.rotation ?? defaults.rotation,
    flipX: stored.flipX ?? defaults.flipX,
    speed: clampVideoSpeed(stored.speed ?? defaults.speed),
    volume: clampVideoVolume(stored.volume ?? defaults.volume),
    muted: stored.muted,
    fadeIn: clampVideoFade(stored.fadeIn ?? defaults.fadeIn),
    fadeOut: clampVideoFade(stored.fadeOut ?? defaults.fadeOut),
    exportFormat: stored.exportFormat,
  };
  const epsilon = 1e-3;
  if (Math.abs(state.duration - duration) > epsilon) return null;
  const [first] = state.segments;
  const last = state.segments.at(-1);
  if (first === undefined || last === undefined) return null;
  if (Math.abs(first.start) > epsilon || Math.abs(last.end - duration) > epsilon) return null;
  for (let i = 0; i < state.segments.length; i += 1) {
    const segment = state.segments[i];
    const next = state.segments[i + 1];
    if (segment === undefined || segment.end <= segment.start) return null;
    if (next !== undefined && Math.abs(next.start - segment.end) > epsilon) return null;
  }
  if (state.crop.width <= 0 || state.crop.height <= 0) return null;
  return { ...state, crop: clampNormalizedRect(state.crop) };
}
