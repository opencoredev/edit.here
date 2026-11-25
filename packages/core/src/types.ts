/** Pure domain types shared by the app shell and every editor. No DOM types live here. */

export type MediaKind = "image" | "video";

/** A rectangle in 0..1 space relative to the media's natural size. */
export type NormalizedRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type HistoryStack<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

export type LoadedMediaMeta = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly kind: MediaKind;
};

/** Structural subset of the DOM `File` the core needs; a real `File` satisfies it. */
export type FileLike = {
  readonly name: string;
  readonly type: string;
  readonly size: number;
};

// ---------------------------------------------------------------------------
// Redaction model

export type RedactionStyle = "blackout" | "blur" | "pixelate";

export type RedactionBox = {
  readonly id: string;
  readonly rect: NormalizedRect;
  readonly style: RedactionStyle;
  /** 0..1. Blur radius or pixel block size scale; ignored by `blackout`. */
  readonly intensity: number;
};

// ---------------------------------------------------------------------------
// Image

/**
 * `select` is the neutral mode: no crop handles, click to pick and move drawings. The drawing
 * tools add annotations; `crop`, `redact` and `frame` edit the image itself.
 */
export type ImageTool =
  | "select"
  | "pen"
  | "highlighter"
  | "arrow"
  | "rectangle"
  | "text"
  | "crop"
  | "redact"
  | "frame";

/** A point in normalized (0..1) space. */
export type NormalizedPoint = {
  readonly x: number;
  readonly y: number;
};

/**
 * Color and stroke shared by the drawing tools. `size` is the stroke width as a fraction of the
 * source image's long edge, so a drawing keeps its weight at any export scale.
 */
export type AnnotationStyle = {
  readonly color: string;
  readonly size: number;
};

type StrokeBase = AnnotationStyle & { readonly id: string };

/**
 * Drawings on top of the image. Geometry is in source space (like redactions), so a drawing
 * stays on the same pixels through crop, rotate and flip. Text keeps reading upright.
 */
export type StrokeAnnotation =
  | (StrokeBase & {
      readonly kind: "pen" | "highlighter";
      readonly points: readonly NormalizedPoint[];
    })
  | (StrokeBase & {
      readonly kind: "arrow";
      readonly from: NormalizedPoint;
      readonly to: NormalizedPoint;
    })
  | (StrokeBase & { readonly kind: "rectangle"; readonly rect: NormalizedRect })
  | (StrokeBase & {
      readonly kind: "text";
      /** Top-left corner of the first line. */
      readonly at: NormalizedPoint;
      readonly text: string;
    });

/**
 * Another picture placed on the canvas (a pasted screenshot). `rect` is in the base image's
 * source space but is not limited to 0..1, so a layer can sit beside the base image; the
 * composition grows to fit it. The picture fills `rect` and turns and flips with the canvas.
 */
export type ImageLayer = {
  readonly id: string;
  readonly kind: "image";
  /** Key of the picture's file in the editor's asset store. */
  readonly assetId: string;
  readonly rect: NormalizedRect;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  /** Corner radius in base-image source pixels. */
  readonly radius: number;
  /**
   * The part of the picture shown, in 0..1 of its natural size. Absent means the whole picture
   * (`FULL_RECT`); saves from before layer cropping have none.
   */
  readonly crop?: NormalizedRect;
};

/** Everything on the canvas above the base image, in paint order (last is on top). */
export type ImageAnnotation = StrokeAnnotation | ImageLayer;

export type ImageAnnotationKind = ImageAnnotation["kind"];

export type ImageRotation = 0 | 90 | 180 | 270;

export type BackgroundPreset =
  | "none"
  | "dusk"
  | "azure"
  | "lagoon"
  | "canopy"
  | "solstice"
  | "orchid"
  | "midnight"
  | "graphite"
  | "mist"
  | "linen"
  | "custom";

/** How the `custom` frame background paints: one color, or a two-color linear gradient. */
export type CustomBackgroundMode = "solid" | "gradient";

export type FrameConfig = {
  readonly enabled: boolean;
  readonly preset: BackgroundPreset;
  readonly customMode: CustomBackgroundMode;
  /** CSS hex color: the solid fill, or the gradient's first stop. */
  readonly customColor: string;
  /** CSS hex color for the gradient's last stop. */
  readonly customColorEnd: string;
  /** Gradient angle in CSS degrees (0 points up, clockwise). */
  readonly customAngle: number;
  /** Padding in output pixels around the image. */
  readonly padding: number;
  /** Corner radius in output pixels applied to the image. */
  readonly radius: number;
  readonly shadow: boolean;
};

export type ImageExportFormat = "image/png" | "image/jpeg" | "image/webp";

export type ImageDocumentState = {
  readonly tool: ImageTool;
  readonly crop: NormalizedRect;
  readonly rotation: ImageRotation;
  readonly flipX: boolean;
  readonly redactions: readonly RedactionBox[];
  readonly selectedRedactionId: string | null;
  readonly redactionStyle: RedactionStyle;
  readonly annotations: readonly ImageAnnotation[];
  readonly selectedAnnotationId: string | null;
  /** Color and stroke for the next drawing (and the selected one in select mode). */
  readonly annotationStyle: AnnotationStyle;
  readonly frame: FrameConfig;
  /** Export with a transparent background where the frame is off. */
  readonly transparent: boolean;
  readonly exportFormat: ImageExportFormat;
};

// ---------------------------------------------------------------------------
// Video

/** The video tool whose options tray is open; `none` keeps the stage clear. */
export type VideoTool = "none" | "trim" | "crop" | "speed" | "audio";

/**
 * A slice of the source timeline in seconds. Segments tile [0, duration] in order. `volume`,
 * `muted` and `speed` override the document's values for this clip only; a field left out
 * inherits the document's value.
 */
export type VideoSegment = {
  readonly id: string;
  readonly start: number;
  readonly end: number;
  readonly deleted: boolean;
  /** 0 to 2; inherits `VideoDocumentState.volume` when absent. */
  readonly volume?: number;
  /** Inherits `VideoDocumentState.muted` when absent. */
  readonly muted?: boolean;
  /** 0.25 to 4; inherits `VideoDocumentState.speed` when absent. */
  readonly speed?: number;
};

export type VideoCropAspect = "free" | "16:9" | "9:16" | "1:1" | "4:5";

export type VideoExportFormat = "mp4" | "webm";

export type VideoDocumentState = {
  readonly tool: VideoTool;
  readonly duration: number;
  readonly segments: readonly VideoSegment[];
  readonly crop: NormalizedRect;
  readonly cropEnabled: boolean;
  readonly cropAspect: VideoCropAspect;
  /** Clockwise turn applied before the flip and the crop (the crop is in the turned frame). */
  readonly rotation: ImageRotation;
  /** Mirror left to right after the turn. */
  readonly flipX: boolean;
  /** Playback speed of the output, 0.25 to 4. */
  readonly speed: number;
  /** Audio gain, 0 to 2 (0% to 200%). */
  readonly volume: number;
  readonly muted: boolean;
  /** Fade-in and fade-out lengths on the output timeline, in seconds (0 to 5). */
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly exportFormat: VideoExportFormat;
};

// ---------------------------------------------------------------------------
// Shell

export type ToastTone = "info" | "success" | "error";

export type ToastMessage = {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
};

export type ColorMode = "dark" | "light";
