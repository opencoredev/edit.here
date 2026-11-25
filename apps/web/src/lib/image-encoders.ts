/**
 * Which image formats this browser's canvas can encode. Safari (iOS and macOS) has no WebP
 * encoder: asked for WebP, `toBlob` and `convertToBlob` quietly return a PNG, which then saved
 * as `name.webp.png`. Exports offer only the formats that really encode.
 */
import {
  exportFileName,
  IMAGE_EXPORT_FORMATS,
  type ExportFormatInfo,
  type ImageExportFormat,
} from "@edit-here/core";

const support = new Map<ImageExportFormat, boolean>();

/** Whether a canvas here encodes `format`. PNG always does; others are probed once with a 1×1 canvas. */
export function canEncodeImage(format: ImageExportFormat): boolean {
  if (format === "image/png") return true;
  const known = support.get(format);
  if (known !== undefined) return known;
  let encodes = false;
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      encodes = canvas.toDataURL(format).startsWith(`data:${format}`);
    } catch {
      encodes = false;
    }
  }
  support.set(format, encodes);
  return encodes;
}

/** The export formats this browser can write, in catalog order. */
export function encodableImageFormats(): readonly ExportFormatInfo[] {
  return IMAGE_EXPORT_FORMATS.filter((info) => canEncodeImage(info.format));
}

/** `format` where this browser encodes it, else PNG (which every browser encodes). */
export function encodableImageFormat(format: ImageExportFormat): ImageExportFormat {
  return canEncodeImage(format) ? format : "image/png";
}

/** The export format `blob` really holds, from its MIME type; null for any other type. */
export function exportFormatOfBlob(blob: Blob): ImageExportFormat | null {
  return IMAGE_EXPORT_FORMATS.find((info) => info.format === blob.type)?.format ?? null;
}

/**
 * What an image export wrote: the format the bytes really hold (an encoder can hand back PNG for
 * another request), else `requested`, and the source name with that format's extension.
 */
export function imageExportOutput(args: {
  readonly sourceName: string;
  readonly blob: Blob;
  readonly requested: ImageExportFormat;
}): { readonly fileName: string; readonly format: ImageExportFormat } {
  const format = exportFormatOfBlob(args.blob) ?? args.requested;
  return { fileName: exportFileName(args.sourceName, format), format };
}
