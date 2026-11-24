/** Messages between the timeline and the filmstrip worker (`filmstrip.worker.ts`). */

/** What the filmstrip decodes: `count` evenly spaced tiles of `tileWidth`×`tileHeight` pixels. */
export type FilmstripRequest = {
  readonly kind: "start";
  readonly id: number;
  readonly file: File;
  readonly duration: number;
  readonly count: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
};

export type FilmstripCommand = FilmstripRequest | { readonly kind: "cancel"; readonly id: number };

export type FilmstripReply =
  | {
      readonly kind: "tile";
      readonly id: number;
      readonly index: number;
      readonly bitmap: ImageBitmap;
    }
  | { readonly kind: "done"; readonly id: number }
  | { readonly kind: "failed"; readonly id: number };

function hasNumber(value: object, key: string): boolean {
  return key in value && typeof Reflect.get(value, key) === "number";
}

export function isFilmstripReply(value: unknown): value is FilmstripReply {
  if (typeof value !== "object" || value === null || !hasNumber(value, "id")) return false;
  const kind: unknown = Reflect.get(value, "kind");
  switch (kind) {
    case "tile":
      return (
        hasNumber(value, "index") &&
        typeof ImageBitmap !== "undefined" &&
        Reflect.get(value, "bitmap") instanceof ImageBitmap
      );
    case "done":
    case "failed":
      return true;
    default:
      return false;
  }
}

export function isFilmstripCommand(value: unknown): value is FilmstripCommand {
  if (typeof value !== "object" || value === null || !hasNumber(value, "id")) return false;
  const kind: unknown = Reflect.get(value, "kind");
  switch (kind) {
    case "cancel":
      return true;
    case "start":
      return (
        Reflect.get(value, "file") instanceof File &&
        ["duration", "count", "tileWidth", "tileHeight"].every((key) => hasNumber(value, key))
      );
    default:
      return false;
  }
}
