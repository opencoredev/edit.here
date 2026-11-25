import { afterEach, describe, expect, it, vi } from "vitest";

type EncodersModule = typeof import("../src/lib/image-encoders");

/**
 * A fresh copy of the module (its probe cache starts empty) over a document whose canvas
 * encodes `encodes`, and hands back anything else as PNG the way Safari does for WebP.
 */
async function withCanvas(encodes: readonly string[] | "throws"): Promise<{
  readonly encoders: EncodersModule;
  readonly probes: () => number;
}> {
  let probes = 0;
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      toDataURL: (type: string) => {
        probes++;
        if (encodes === "throws") throw new Error("canvas blocked");
        return encodes.includes(type) ? `data:${type};base64,AA` : "data:image/png;base64,AA";
      },
    }),
  });
  vi.resetModules();
  return { encoders: await import("../src/lib/image-encoders"), probes: () => probes };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("image encoders", () => {
  it("offers WebP only where the canvas really encodes it", async () => {
    const safari = (await withCanvas(["image/jpeg"])).encoders;
    expect(safari.encodableImageFormats().map((f) => f.format)).toEqual([
      "image/png",
      "image/jpeg",
    ]);
    const chrome = (await withCanvas(["image/jpeg", "image/webp"])).encoders;
    expect(chrome.encodableImageFormats().map((f) => f.format)).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("falls back to PNG for a saved format the browser can't encode", async () => {
    const { encoders } = await withCanvas(["image/jpeg"]);
    expect(encoders.encodableImageFormat("image/webp")).toBe("image/png");
    expect(encoders.encodableImageFormat("image/jpeg")).toBe("image/jpeg");
  });

  it("treats a canvas that throws as unable to encode, and PNG as always encodable", async () => {
    const { encoders } = await withCanvas("throws");
    expect(encoders.canEncodeImage("image/webp")).toBe(false);
    expect(encoders.canEncodeImage("image/png")).toBe(true);
  });

  it("probes each format once", async () => {
    const { encoders, probes } = await withCanvas(["image/jpeg"]);
    encoders.canEncodeImage("image/webp");
    encoders.canEncodeImage("image/webp");
    encoders.encodableImageFormats();
    expect(probes()).toBe(2);
  });

  it("names an export by the type of the bytes it holds", async () => {
    const { encoders } = await withCanvas([]);
    expect(encoders.exportFormatOfBlob(new Blob([], { type: "image/png" }))).toBe("image/png");
    expect(encoders.exportFormatOfBlob(new Blob([], { type: "image/gif" }))).toBeNull();
  });

  it("names the export toast's file for the format written, not the source", async () => {
    const { encoders } = await withCanvas(["image/jpeg", "image/webp"]);
    const named = (type: string, requested: "image/png" | "image/jpeg" | "image/webp") =>
      encoders.imageExportOutput({
        sourceName: "sample-dashboard.png",
        blob: new Blob([], { type }),
        requested,
      }).fileName;
    expect(named("image/jpeg", "image/jpeg")).toBe("sample-dashboard-edited.jpg");
    expect(named("image/webp", "image/webp")).toBe("sample-dashboard-edited.webp");
    expect(named("image/png", "image/png")).toBe("sample-dashboard-edited.png");
    // An encoder that hands back PNG for a WebP request downloads, and is announced, as .png.
    expect(named("image/png", "image/webp")).toBe("sample-dashboard-edited.png");
    // Bytes of no known type keep the requested extension.
    expect(named("", "image/jpeg")).toBe("sample-dashboard-edited.jpg");
  });

  it("reports the format the bytes hold, so analytics counts what was written", async () => {
    const { encoders } = await withCanvas([]);
    const output = encoders.imageExportOutput({
      sourceName: "shot.png",
      blob: new Blob([], { type: "image/png" }),
      requested: "image/webp",
    });
    expect(output).toEqual({ fileName: "shot-edited.png", format: "image/png" });
  });
});
