/**
 * Pixel layout for rendering and exporting an edited image: crop in pixels, output canvas
 * size, frame padding, corner radius, shadow and the background to paint.
 *
 * The composition is the base image plus any image layers beside it. Without outlying layers
 * it is exactly the cropped base image, and the layout is what it has always been.
 */
import { clamp, frameBackgroundCss } from "../operations";
import type { FrameConfig, ImageExportFormat, NormalizedRect } from "../types";
import { orientedSize, type ImageGeometry, type ImageSize } from "./geometry";

export type PixelRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ShadowLayer = {
  readonly blur: number;
  readonly offsetY: number;
  /** 0..1 alpha of the black shadow. */
  readonly opacity: number;
};

/** A soft ambient lift plus a tight contact shadow under the image, painted in that order. */
export type FrameShadow = { readonly ambient: ShadowLayer; readonly contact: ShadowLayer };

/** A rounded rect in output pixels. */
export type RoundedRect = { readonly rect: PixelRect; readonly radius: number };

/** One shape of the composition for shadow casting, in view space (see `compositionPieces`). */
export type LayoutPiece = {
  readonly rect: NormalizedRect;
  /** Radius in base source pixels; null takes the frame radius. */
  readonly radius: number | null;
};

export type ImageLayout = {
  /** The oriented image at full resolution. */
  readonly oriented: ImageSize;
  /** Crop in oriented full-resolution pixels. */
  readonly cropPixels: PixelRect;
  /** Output canvas size at the requested scale. */
  readonly output: ImageSize;
  /** Where the cropped base image lands on the output canvas. */
  readonly image: PixelRect;
  /** Where the whole composition (base plus layers) lands; equals `image` without layers beside it. */
  readonly content: PixelRect;
  /** Corner radius the composition is clipped to. 0 when layers reach past the base image. */
  readonly radius: number;
  /** Corner radius of the base image inside an expanded composition; 0 otherwise. */
  readonly baseRadius: number;
  readonly shadow: FrameShadow | null;
  /** The shapes that cast the shadow, in output pixels. */
  readonly shadowShapes: readonly RoundedRect[];
  /** Width in output pixels of the light inner edge on a framed image; 0 for none. */
  readonly hairline: number;
};

/** The base image's rect inside the composition canvas (`content`-sized, origin at its corner). */
export function baseRectInContent(layout: ImageLayout): PixelRect {
  return {
    x: layout.image.x - layout.content.x,
    y: layout.image.y - layout.content.y,
    width: layout.image.width,
    height: layout.image.height,
  };
}

/** Crop rect in whole oriented pixels; at least 1×1 and inside the image. */
export function imageCropPixels(crop: NormalizedRect, oriented: ImageSize): PixelRect {
  const x = clamp(Math.round(crop.x * oriented.width), 0, oriented.width - 1);
  const y = clamp(Math.round(crop.y * oriented.height), 0, oriented.height - 1);
  const width = clamp(Math.round(crop.width * oriented.width), 1, oriented.width - x);
  const height = clamp(Math.round(crop.height * oriented.height), 1, oriented.height - y);
  return { x, y, width, height };
}

/** Size of the cropped result in pixels, for the live readout. */
export function croppedPixelSize(source: ImageSize, geometry: ImageGeometry): ImageSize {
  const { width, height } = imageCropPixels(geometry.crop, orientedSize(source, geometry.rotation));
  return { width, height };
}

/**
 * Lays out the output. `scale` shrinks everything (image, padding, radius, shadow) together,
 * so a preview at 0.25 looks exactly like the export at 1.
 */
export function computeImageLayout(args: {
  readonly source: ImageSize;
  readonly geometry: ImageGeometry;
  readonly frame: FrameConfig;
  readonly scale?: number;
  /** The composition in view space (`imageCompositionBounds`); the base image when omitted. */
  readonly bounds?: NormalizedRect;
  /** Shapes that cast the frame shadow in an expanded composition (`compositionPieces`). */
  readonly pieces?: readonly LayoutPiece[];
}): ImageLayout {
  const scale = args.scale ?? 1;
  const oriented = orientedSize(args.source, args.geometry.rotation);
  const cropPixels = imageCropPixels(args.geometry.crop, oriented);
  const imageWidth = Math.max(1, Math.round(cropPixels.width * scale));
  const imageHeight = Math.max(1, Math.round(cropPixels.height * scale));
  const { frame } = args;
  const padding = frame.enabled ? Math.max(0, Math.round(frame.padding * scale)) : 0;

  // The composition's edges in base-image pixels; never inside the base image.
  const bounds = args.bounds ?? { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.min(0, Math.round(bounds.x * imageWidth));
  const top = Math.min(0, Math.round(bounds.y * imageHeight));
  const right = Math.max(imageWidth, Math.round((bounds.x + bounds.width) * imageWidth));
  const bottom = Math.max(imageHeight, Math.round((bounds.y + bounds.height) * imageHeight));
  const expanded = left < 0 || top < 0 || right > imageWidth || bottom > imageHeight;
  const content: PixelRect = {
    x: padding,
    y: padding,
    width: right - left,
    height: bottom - top,
  };
  const image: PixelRect = {
    x: padding - left,
    y: padding - top,
    width: imageWidth,
    height: imageHeight,
  };

  const frameRadius = frame.enabled
    ? Math.min(
        Math.max(0, Math.round(frame.radius * scale)),
        Math.floor(Math.min(imageWidth, imageHeight) / 2),
      )
    : 0;
  const radius = expanded ? 0 : frameRadius;
  const shadow: FrameShadow | null =
    frame.enabled && frame.shadow && padding > 0
      ? {
          ambient: {
            blur: Math.max(1, Math.round(padding * 0.6)),
            offsetY: Math.round(padding * 0.2),
            opacity: 0.3,
          },
          contact: {
            blur: Math.max(1, Math.round(padding * 0.08)),
            offsetY: Math.max(1, Math.round(padding * 0.03)),
            opacity: 0.2,
          },
        }
      : null;
  // Output pixels per base source pixel, for layer radii.
  const k = imageWidth / cropPixels.width;
  const shadowShapes: readonly RoundedRect[] =
    shadow === null
      ? []
      : expanded
        ? (args.pieces ?? [{ rect: { x: 0, y: 0, width: 1, height: 1 }, radius: null }]).map(
            (piece) => {
              const rect: PixelRect = {
                x: image.x + Math.round(piece.rect.x * imageWidth),
                y: image.y + Math.round(piece.rect.y * imageHeight),
                width: Math.round(piece.rect.width * imageWidth),
                height: Math.round(piece.rect.height * imageHeight),
              };
              const wanted = piece.radius === null ? frameRadius : Math.round(piece.radius * k);
              return {
                rect,
                radius: Math.max(
                  0,
                  Math.min(wanted, Math.floor(Math.min(rect.width, rect.height) / 2)),
                ),
              };
            },
          )
        : [{ rect: content, radius }];
  return {
    oriented,
    cropPixels,
    output: { width: content.width + padding * 2, height: content.height + padding * 2 },
    image,
    content,
    radius,
    baseRadius: expanded ? frameRadius : 0,
    shadow,
    shadowShapes,
    hairline: frame.enabled && padding > 0 && !expanded ? Math.max(0.5, scale * 1.5) : 0,
  };
}

/** Scale (≤ 1) that keeps `size` under the longest edge `maxEdge`. */
export function scaleToFitEdge(size: ImageSize, maxEdge: number): number {
  const longest = Math.max(size.width, size.height);
  return longest <= maxEdge ? 1 : maxEdge / longest;
}

/** Scale (≤ 1) that keeps `size` under `maxPixels` total pixels (canvas area limits). */
export function scaleToFitArea(size: ImageSize, maxPixels: number): number {
  const area = size.width * size.height;
  return area <= maxPixels ? 1 : Math.sqrt(maxPixels / area);
}

/** Largest canvas area iOS Safari will allocate. Desktop browsers allow far more. */
export const SAFE_CANVAS_PIXELS = 16_777_216;

/** Frame defaults sized to the image, so a 4K screenshot and a small crop both look framed. */
export function suggestedFrameSize(source: ImageSize): Pick<FrameConfig, "padding" | "radius"> {
  const longest = Math.max(source.width, source.height);
  return {
    padding: Math.round(clamp(longest * 0.06, 24, 400)),
    radius: Math.round(clamp(longest * 0.015, 8, 120)),
  };
}

// ---------------------------------------------------------------------------
// Export

export type ExportFormatInfo = {
  readonly format: ImageExportFormat;
  readonly label: string;
  readonly extension: string;
  /** Whether the format can store transparency. */
  readonly alpha: boolean;
  /** Encoder quality for lossy formats. */
  readonly quality: number | undefined;
};

export const IMAGE_EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { format: "image/png", label: "PNG", extension: "png", alpha: true, quality: undefined },
  { format: "image/jpeg", label: "JPEG", extension: "jpg", alpha: false, quality: 0.92 },
  { format: "image/webp", label: "WebP", extension: "webp", alpha: true, quality: 0.92 },
];

export function exportFormatInfo(format: ImageExportFormat): ExportFormatInfo {
  const info = IMAGE_EXPORT_FORMATS.find((entry) => entry.format === format);
  if (info === undefined) throw new Error(`Unknown export format ${format}`);
  return info;
}

/** What to paint behind the image before drawing it. */
export type ExportBackground =
  | { readonly kind: "transparent" }
  | { readonly kind: "frame"; readonly css: string }
  /** Formats without alpha get a white matte where the result would be transparent. */
  | { readonly kind: "matte" };

export function resolveExportBackground(args: {
  readonly frame: FrameConfig;
  readonly transparent: boolean;
  readonly format: ImageExportFormat;
}): ExportBackground {
  const { frame } = args;
  const frameCss = frame.enabled && frame.preset !== "none" ? frameBackgroundCss(frame) : null;
  if (frameCss !== null && !args.transparent) return { kind: "frame", css: frameCss };
  if (exportFormatInfo(args.format).alpha) return { kind: "transparent" };
  return frameCss === null ? { kind: "matte" } : { kind: "frame", css: frameCss };
}

/** `shot.final.png` + JPEG → `shot.final-edited.jpg`. */
export function exportFileName(name: string, format: ImageExportFormat): string {
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  return `${base === "" ? "image" : base}-edited.${exportFormatInfo(format).extension}`;
}

// ---------------------------------------------------------------------------
// Redaction rendering

/**
 * Cell size in pixels for pixelate blocks and the blur's downsample step. It scales with the
 * image's long edge so a preview and the full-size export look the same.
 */
export function redactionCellSize(args: {
  readonly intensity: number;
  readonly imageLongEdge: number;
}): number {
  const t = clamp(args.intensity, 0, 1);
  return Math.max(2, Math.round(args.imageLongEdge * (0.008 + 0.03 * t)));
}

/** Rect in whole pixels covering a normalized rect, expanded outward so no edge pixel leaks. */
export function coverPixels(rect: NormalizedRect, size: ImageSize): PixelRect {
  const x0 = clamp(Math.floor(rect.x * size.width), 0, size.width);
  const y0 = clamp(Math.floor(rect.y * size.height), 0, size.height);
  const x1 = clamp(Math.ceil((rect.x + rect.width) * size.width), 0, size.width);
  const y1 = clamp(Math.ceil((rect.y + rect.height) * size.height), 0, size.height);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
