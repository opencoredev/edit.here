import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A worker that fails to start (its script 404s, say) while the page is still copying the
 * bitmaps for the first export. The export must fall back to the page, not wait forever.
 */
class DyingWorker extends EventTarget {
  static last: DyingWorker | null = null;
  posted = 0;
  constructor() {
    super();
    DyingWorker.last = this;
  }
  postMessage(): void {
    this.posted += 1;
  }
  terminate(): void {}
}

class FakeBitmap {
  closed = false;
  close(): void {
    this.closed = true;
  }
}

const pageExport = vi.fn<() => Promise<Blob>>(
  async () => new Blob(["page"], { type: "image/png" }),
);

vi.mock("../src/editors/image/render", () => ({ exportImageBlob: pageExport }));

describe("exportImage", () => {
  beforeEach(() => {
    vi.resetModules();
    pageExport.mockClear();
    DyingWorker.last = null;
    vi.stubGlobal("Worker", DyingWorker);
    // Only its presence matters: the client checks `typeof OffscreenCanvas`.
    vi.stubGlobal("OffscreenCanvas", function OffscreenCanvas() {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the page when the worker dies while bitmaps are copied", async () => {
    const copies: FakeBitmap[] = [];
    vi.stubGlobal("createImageBitmap", async () => {
      // The worker's error arrives while this copy is in flight.
      DyingWorker.last?.dispatchEvent(new Event("error"));
      const copy = new FakeBitmap();
      copies.push(copy);
      return copy;
    });
    const { exportImage } = await import("../src/editors/image/export-client");
    const args = {
      source: new FakeBitmap(),
      sourceSize: { width: 10, height: 10 },
      state: {},
      layers: new Map(),
      format: "image/png",
    };
    const result = await Promise.race([
      exportImage(args as never),
      new Promise<"stuck">((resolve) => setTimeout(() => resolve("stuck"), 500)),
    ]);
    expect(result).not.toBe("stuck");
    expect(pageExport).toHaveBeenCalledTimes(1);
    expect(DyingWorker.last?.posted).toBe(0);
    expect(copies.every((copy) => copy.closed)).toBe(true);
  });
});
