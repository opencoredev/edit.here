import { describe, expect, it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import {
  detectMediaKind,
  detectMediaKindSync,
  FILE_INPUT_ACCEPT,
  UnsupportedFileError,
} from "../src/index";

const file = (name: string, type = "") => ({ name, type, size: 1 });

describe("detectMediaKind", () => {
  it.effect("detects by MIME type", () =>
    Effect.gen(function* () {
      expect(yield* detectMediaKind(file("x", "image/png"))).toBe("image");
      expect(yield* detectMediaKind(file("x", "video/quicktime"))).toBe("video");
      expect(yield* detectMediaKind(file("x", "video/webm;codecs=vp9"))).toBe("video");
    }),
  );

  it.effect("falls back to the extension when MIME is empty or generic", () =>
    Effect.gen(function* () {
      for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"]) {
        expect(yield* detectMediaKind(file(`shot.${ext}`))).toBe("image");
      }
      for (const ext of ["mp4", "webm", "mov", "mkv", "m4v"]) {
        expect(yield* detectMediaKind(file(`clip.${ext.toUpperCase()}`))).toBe("video");
      }
    }),
  );

  it.effect("fails with UnsupportedFileError for other files", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(detectMediaKind(file("notes.txt", "text/plain")));
      expect(Exit.isFailure(exit)).toBe(true);
      const error = yield* Effect.flip(detectMediaKind(file("notes.txt", "text/plain")));
      expect(error).toBeInstanceOf(UnsupportedFileError);
      expect(error._tag).toBe("UnsupportedFileError");
      expect(error.message).toContain("notes.txt");
    }),
  );

  it("rejects SVG, PDF, extensionless names and trailing dots", () => {
    expect(detectMediaKindSync(file("logo.svg", "image/svg+xml"))).toBeNull();
    expect(detectMediaKindSync(file("doc.pdf", "application/pdf"))).toBeNull();
    expect(detectMediaKindSync(file("doc.pdf"))).toBeNull();
    expect(detectMediaKindSync(file("README"))).toBeNull();
    expect(detectMediaKindSync(file("weird."))).toBeNull();
  });

  it("builds an accept attribute covering every extension", () => {
    expect(FILE_INPUT_ACCEPT).toContain("image/*");
    expect(FILE_INPUT_ACCEPT).toContain(".mkv");
    expect(FILE_INPUT_ACCEPT).not.toContain("pdf");
  });
});
