/**
 * Small pictures of a project for Home's recent list, as data URLs (WebP, or JPEG where the
 * browser can't encode WebP). They are kept with the project in IndexedDB, so they stay small.
 */
import type { MediaKind } from "@edit-here/core";

/** Longest edge of a thumbnail, in pixels: sharp on a 2× display at card size. */
export const THUMBNAIL_EDGE = 320;

const QUALITY = 0.8;

/** The scale that brings `size` down to `THUMBNAIL_EDGE` on its longest side (never up). */
export function thumbnailScale(size: { readonly width: number; readonly height: number }): number {
  const longest = Math.max(size.width, size.height);
  return longest <= THUMBNAIL_EDGE || longest <= 0 ? 1 : THUMBNAIL_EDGE / longest;
}

type ThumbnailCanvas = HTMLCanvasElement | OffscreenCanvas;

/** True for an OffscreenCanvas; `typeof` first, since some browsers have no such global. */
function isOffscreen(canvas: ThumbnailCanvas): canvas is OffscreenCanvas {
  return typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
}

function createThumbnailCanvas(width: number, height: number): ThumbnailCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Encodes `canvas` without blocking the page: the pixels are read when this is called, and the
 * encoder runs off the main thread where the browser allows it. Null when it can't encode.
 */
function encodeCanvas(canvas: ThumbnailCanvas, type: string): Promise<Blob | null> {
  if (isOffscreen(canvas)) {
    return canvas.convertToBlob({ type, quality: QUALITY }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

function context2d(
  canvas: ThumbnailCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return isOffscreen(canvas) ? canvas.getContext("2d") : canvas.getContext("2d");
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve(typeof reader.result === "string" ? reader.result : null),
    );
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(blob);
  });
}

/**
 * Encodes a canvas already at thumbnail size, as WebP, or JPEG on a white matte where the
 * browser can't encode WebP. The canvas is read right away, so its sources may close after.
 */
export async function encodeThumbnailCanvas(canvas: ThumbnailCanvas): Promise<string | null> {
  const webp = encodeCanvas(canvas, "image/webp");
  // Browsers that can't encode WebP hand back a PNG instead; the matte goes on only then, and
  // only after the pixels for the WebP attempt were read.
  const blob = await webp;
  if (blob !== null && blob.type === "image/webp") return blobToDataUrl(blob);
  const ctx = context2d(canvas);
  if (ctx === null) return null;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jpeg = await encodeCanvas(canvas, "image/jpeg");
  return jpeg === null ? null : blobToDataUrl(jpeg);
}

/**
 * Draws `source` (`width` × `height` pixels) at thumbnail size and encodes it. Transparency is
 * kept in WebP; the JPEG fallback gets a white matte. `source` is drawn before this returns its
 * promise, so the caller may close it once the call is made.
 */
export function encodeThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string | null> {
  if (width <= 0 || height <= 0) return Promise.resolve(null);
  const scale = thumbnailScale({ width, height });
  const canvas = createThumbnailCanvas(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
  const ctx = context2d(canvas);
  if (ctx === null) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return encodeThumbnailCanvas(canvas);
}

async function imageThumbnail(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    return await encodeThumbnail(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function once(target: EventTarget, type: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      target.removeEventListener(type, onEvent);
      target.removeEventListener("error", onError);
      resolve(ok);
    };
    const onEvent = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    target.addEventListener(type, onEvent);
    target.addEventListener("error", onError);
  });
}

/** A frame a little way in (the first is often black), from a detached video element. */
async function videoThumbnail(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const loaded = once(video, "loadeddata", 5000);
    video.src = url;
    if (!(await loaded)) return null;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const at = Math.min(1, duration * 0.1);
    if (at > 0) {
      const seeked = once(video, "seeked", 3000);
      video.currentTime = at;
      await seeked;
    }
    return await encodeThumbnail(video, video.videoWidth, video.videoHeight);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** A thumbnail of the file as opened, before any edits; null when it can't be made. */
export async function sourceThumbnail(file: File, kind: MediaKind): Promise<string | null> {
  try {
    switch (kind) {
      case "image":
        return await imageThumbnail(file);
      case "video":
        return await videoThumbnail(file);
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  } catch {
    return null;
  }
}
