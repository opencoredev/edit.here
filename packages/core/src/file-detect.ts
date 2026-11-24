import { Effect } from "effect";
import { UnsupportedFileError } from "./errors";
import type { FileLike, MediaKind } from "./types";

const EXTENSION_KINDS: Readonly<Record<string, MediaKind>> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  avif: "image",
  bmp: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mkv: "video",
  m4v: "video",
};

export const SUPPORTED_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_KINDS);

/** Value for an `<input type="file" accept>` attribute. */
export const FILE_INPUT_ACCEPT = [
  "image/*",
  "video/*",
  ...SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

function kindFromMimeType(mimeType: string): MediaKind | null {
  const type = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  // SVG is an image MIME type but a document format the raster editor can't open safely.
  if (type === "image/svg+xml") return null;
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return null;
}

function kindFromExtension(fileName: string): MediaKind | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_KINDS[ext] ?? null;
}

/** Pure detection: MIME type first, then file extension (pasted files often lack a MIME type). */
export function detectMediaKindSync(file: FileLike): MediaKind | null {
  return kindFromMimeType(file.type) ?? kindFromExtension(file.name);
}

export function detectMediaKind(file: FileLike): Effect.Effect<MediaKind, UnsupportedFileError> {
  const kind = detectMediaKindSync(file);
  return kind === null
    ? Effect.fail(new UnsupportedFileError({ fileName: file.name, mimeType: file.type }))
    : Effect.succeed(kind);
}
