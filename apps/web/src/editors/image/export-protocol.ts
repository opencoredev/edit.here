/**
 * Messages between the image editor and its export worker (`export-worker.ts`). The worker runs
 * the same `exportImageBlob` as the page, on copies of the editor's bitmaps.
 */
import type { ImageDocumentState, ImageExportFormat, ImageSize } from "@edit-here/core";

export type ExportRequest = {
  readonly id: number;
  /** Full-resolution base image; the worker owns it and closes it when done. */
  readonly source: ImageBitmap;
  readonly sourceSize: ImageSize;
  readonly state: ImageDocumentState;
  /** Full-resolution image layers by asset id; closed by the worker too. */
  readonly layers: readonly (readonly [string, ImageBitmap])[];
  readonly format: ImageExportFormat;
};

export type ExportResponse =
  | { readonly id: number; readonly kind: "done"; readonly blob: Blob }
  /** The worker can't render here (no OffscreenCanvas or worker fonts); the page should. */
  | { readonly id: number; readonly kind: "unsupported" }
  | { readonly id: number; readonly kind: "failed"; readonly message: string };

/**
 * The text annotations' face, as `app.css` declares it for the page. A worker doesn't see the
 * page's fonts, so it loads the same file under the same name before drawing text. Keep this in
 * step with the `Sidebar Inter` rule in `app.css`.
 */
export const TEXT_FONT_FACES = [
  {
    family: "Sidebar Inter",
    source: "url(/fonts/InterVariable.woff2)",
    descriptors: { style: "normal", weight: "100 900" },
  },
] as const;
