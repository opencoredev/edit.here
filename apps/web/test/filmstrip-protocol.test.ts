import { describe, expect, it } from "vitest";
import { isFilmstripCommand, isFilmstripReply } from "../src/editors/video/filmstrip-protocol";

describe("filmstrip worker messages", () => {
  const file = new File([new Uint8Array(4)], "clip.mp4", { type: "video/mp4" });

  it("accepts well-formed commands", () => {
    expect(
      isFilmstripCommand({
        kind: "start",
        id: 1,
        file,
        duration: 20,
        count: 14,
        tileWidth: 200,
        tileHeight: 112,
      }),
    ).toBe(true);
    expect(isFilmstripCommand({ kind: "cancel", id: 1 })).toBe(true);
  });

  it("rejects malformed commands", () => {
    expect(isFilmstripCommand(null)).toBe(false);
    expect(isFilmstripCommand({ kind: "start", id: 1, file, duration: 20 })).toBe(false);
    expect(
      isFilmstripCommand({
        kind: "start",
        id: 1,
        file: "clip.mp4",
        duration: 20,
        count: 14,
        tileWidth: 200,
        tileHeight: 112,
      }),
    ).toBe(false);
    expect(isFilmstripCommand({ kind: "pause", id: 1 })).toBe(false);
  });

  it("accepts end-of-run replies and rejects unknown ones", () => {
    expect(isFilmstripReply({ kind: "done", id: 3 })).toBe(true);
    expect(isFilmstripReply({ kind: "failed", id: 3 })).toBe(true);
    expect(isFilmstripReply({ kind: "done" })).toBe(false);
    expect(isFilmstripReply({ kind: "tile", id: 3, index: 0 })).toBe(false);
  });
});
