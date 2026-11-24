import { scaleToFitEdge, type ImageSize } from "@edit-here/core";
import { useEffect, useState } from "react";

/** Longest preview edge. Big enough for a sharp stage on a 2× display, small enough to redraw per frame. */
export const PREVIEW_EDGE = 2560;

export type DecodedImage = {
  /** Full-resolution pixels, used for export. */
  readonly full: ImageBitmap;
  /** Downscaled copy for the live preview (the same bitmap when the image is small). */
  readonly preview: ImageBitmap;
  readonly size: ImageSize;
};

export type ImageSourceState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly image: DecodedImage }
  | { readonly kind: "error"; readonly message: string };

/** Decodes an image file into a full-size bitmap and a preview-sized one. */
export async function decodeImage(file: Blob, signal?: AbortSignal): Promise<DecodedImage> {
  // Decoding happens off the main thread; EXIF orientation is applied ("from-image").
  const full = await createImageBitmap(file);
  if (signal?.aborted === true) {
    full.close();
    throw new DOMException("Aborted", "AbortError");
  }
  const size = { width: full.width, height: full.height };
  const scale = scaleToFitEdge(size, PREVIEW_EDGE);
  if (scale === 1) return { full, preview: full, size };
  const preview = await createImageBitmap(full, {
    resizeWidth: Math.max(1, Math.round(size.width * scale)),
    resizeHeight: Math.max(1, Math.round(size.height * scale)),
    resizeQuality: "high",
  });
  return { full, preview, size };
}

/** Frees a decoded image's bitmaps. */
export function closeDecodedImage(image: DecodedImage): void {
  image.full.close();
  if (image.preview !== image.full) image.preview.close();
}

/**
 * Decodes begun while the editor first renders, by file, until the effect takes one over. The
 * first commit and paint of a freshly loaded editor take a few hundred milliseconds on a slow
 * device, and the decode runs off the main thread meanwhile instead of starting after them.
 */
const earlyDecodes = new WeakMap<File, Promise<DecodedImage>>();
/** Files an early decode was started for, so later renders don't start another. */
const earlyStarted = new WeakSet<File>();

function startEarlyDecode(file: File): void {
  if (earlyStarted.has(file)) return;
  earlyStarted.add(file);
  const decoding = decodeImage(file);
  // A failure is reported when the effect takes the decode over; until then it is handled.
  decoding.catch(() => undefined);
  earlyDecodes.set(file, decoding);
}

/** The early decode of `file`, once; later calls (a StrictMode rerun, a reopen) decode anew. */
function takeDecode(file: File, signal: AbortSignal): Promise<DecodedImage> {
  const early = earlyDecodes.get(file);
  if (early === undefined) return decodeImage(file, signal);
  earlyDecodes.delete(file);
  return early;
}

/** Decodes `file` once and frees the bitmaps when the file changes or the editor closes. */
export function useImageSource(file: File): ImageSourceState {
  startEarlyDecode(file);
  const [state, setState] = useState<ImageSourceState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let decoded: DecodedImage | null = null;
    // oxlint-disable-next-line react/set-state-in-effect -- resets for a new file before decoding
    setState({ kind: "loading" });
    takeDecode(file, controller.signal).then(
      (image) => {
        if (controller.signal.aborted) {
          image.full.close();
          if (image.preview !== image.full) image.preview.close();
          return;
        }
        decoded = image;
        setState({ kind: "ready", image });
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message:
            cause instanceof Error && cause.message !== ""
              ? `Could not decode this image: ${cause.message}`
              : "Could not decode this image.",
        });
      },
    );
    return () => {
      controller.abort();
      if (decoded !== null) {
        decoded.full.close();
        if (decoded.preview !== decoded.full) decoded.preview.close();
      }
    };
  }, [file]);
  return state;
}
