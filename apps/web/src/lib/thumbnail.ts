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

/**
 * Draws `source` (`width` × `height` pixels) at thumbnail size and encodes it. Transparency is
 * kept in WebP; the JPEG fallback gets a white matte.
 */
export function encodeThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;
  const scale = thumbnailScale({ width, height });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", QUALITY);
  // Browsers that can't encode WebP hand back a PNG instead.
  if (webp.startsWith("data:image/webp")) return webp;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

async function imageThumbnail(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    return encodeThumbnail(bitmap, bitmap.width, bitmap.height);
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
    return encodeThumbnail(video, video.videoWidth, video.videoHeight);
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
