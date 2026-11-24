import { describe, expect, it } from "vitest";
import {
  addImageRedaction,
  applyRedactionStyle,
  commitImageState,
  computeImageLayout,
  coverPixels,
  createImageHistory,
  createRedaction,
  croppedPixelSize,
  DEFAULT_FRAME_CONFIG,
  enterFrameTool,
  exportFileName,
  FULL_RECT,
  baseImageShift,
  imageLayoutsEqual,
  quarterTurns,
  redactionCellSize,
  redoImageState,
  resolveExportBackground,
  rotationFromQuarterTurns,
  scaleToFitArea,
  scaleToFitEdge,
  suggestedFrameSize,
  undoImageState,
  type FrameConfig,
  type ImageGeometry,
} from "../src/index";

const SOURCE = { width: 6000, height: 4000 };
const FRAME_ON: FrameConfig = { ...DEFAULT_FRAME_CONFIG, enabled: true, padding: 64, radius: 12 };

describe("computeImageLayout", () => {
  it("is the cropped image alone when the frame is off", () => {
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: { rotation: 0, flipX: false, crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.25 } },
      frame: DEFAULT_FRAME_CONFIG,
    });
    expect(layout.cropPixels).toEqual({ x: 3000, y: 2000, width: 3000, height: 1000 });
    expect(layout.output).toEqual({ width: 3000, height: 1000 });
    expect(layout.image).toEqual({ x: 0, y: 0, width: 3000, height: 1000 });
    expect(layout.radius).toBe(0);
    expect(layout.shadow).toBeNull();
  });

  it("adds padding on every side and swaps edges after a quarter turn", () => {
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: { rotation: 90, flipX: false, crop: FULL_RECT },
      frame: FRAME_ON,
    });
    expect(layout.output).toEqual({ width: 4000 + 128, height: 6000 + 128 });
    expect(layout.image).toEqual({ x: 64, y: 64, width: 4000, height: 6000 });
    expect(layout.shadow).not.toBeNull();
    expect(layout.hairline).toBeGreaterThan(0);
  });

  it("layers a soft ambient shadow over a tight contact shadow", () => {
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: { rotation: 0, flipX: false, crop: FULL_RECT },
      frame: FRAME_ON,
    });
    const shadow = layout.shadow;
    expect(shadow).not.toBeNull();
    if (shadow === null) return;
    expect(shadow.ambient.blur).toBeGreaterThan(shadow.contact.blur);
    expect(shadow.ambient.offsetY).toBeGreaterThan(shadow.contact.offsetY);
  });

  it("scales image, padding and radius together for previews", () => {
    const full = computeImageLayout({
      source: SOURCE,
      geometry: { rotation: 0, flipX: false, crop: FULL_RECT },
      frame: FRAME_ON,
    });
    const preview = computeImageLayout({
      source: SOURCE,
      geometry: { rotation: 0, flipX: false, crop: FULL_RECT },
      frame: FRAME_ON,
      scale: 0.25,
    });
    expect(preview.output.width / full.output.width).toBeCloseTo(0.25, 2);
    expect(preview.image.x).toBe(16);
    expect(preview.radius).toBe(3);
  });

  it("caps the radius at half the short edge", () => {
    const layout = computeImageLayout({
      source: { width: 40, height: 20 },
      geometry: { rotation: 0, flipX: false, crop: FULL_RECT },
      frame: { ...FRAME_ON, radius: 200 },
    });
    expect(layout.radius).toBe(10);
  });

  it("reports the live crop size in pixels", () => {
    expect(
      croppedPixelSize(SOURCE, {
        rotation: 270,
        flipX: true,
        crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
      }),
    ).toEqual({ width: 2000, height: 3000 });
  });
});

/** A framed composition with one layer at `x` (view space) beside the base image. */
function layerAt(x: number) {
  return computeImageLayout({
    source: SOURCE,
    geometry: { crop: FULL_RECT, rotation: 0, flipX: false },
    frame: FRAME_ON,
    bounds: { x: 0, y: 0, width: 2, height: 1 },
    pieces: [
      { rect: FULL_RECT, radius: null },
      { rect: { x, y: 0, width: 0.5, height: 0.5 }, radius: 0 },
    ],
  });
}

describe("imageLayoutsEqual", () => {
  const geometry: ImageGeometry = { crop: FULL_RECT, rotation: 0, flipX: false };
  it("matches layouts computed twice from the same inputs", () => {
    const a = computeImageLayout({ source: SOURCE, geometry, frame: FRAME_ON, scale: 0.5 });
    const b = computeImageLayout({ source: SOURCE, geometry, frame: FRAME_ON, scale: 0.5 });
    expect(a).not.toBe(b);
    expect(imageLayoutsEqual(a, b)).toBe(true);
  });
  it("tells apart layouts that place pixels differently", () => {
    const a = computeImageLayout({ source: SOURCE, geometry, frame: FRAME_ON });
    const padded = computeImageLayout({
      source: SOURCE,
      geometry,
      frame: { ...FRAME_ON, padding: 65 },
    });
    const grown = computeImageLayout({
      source: SOURCE,
      geometry,
      frame: FRAME_ON,
      bounds: { x: 0, y: 0, width: 1.5, height: 1 },
    });
    const unframed = computeImageLayout({ source: SOURCE, geometry, frame: DEFAULT_FRAME_CONFIG });
    expect(imageLayoutsEqual(a, padded)).toBe(false);
    expect(imageLayoutsEqual(a, grown)).toBe(false);
    expect(imageLayoutsEqual(a, unframed)).toBe(false);
  });
  it("compares the shadow shapes of an expanded composition", () => {
    expect(imageLayoutsEqual(layerAt(1.5), layerAt(1.5))).toBe(true);
    expect(imageLayoutsEqual(layerAt(1.5), layerAt(1.25))).toBe(false);
  });
});

describe("baseImageShift", () => {
  const geometry: ImageGeometry = { crop: FULL_RECT, rotation: 0, flipX: false };
  const grownBy = (bounds: { x: number; y: number; width: number; height: number }) =>
    computeImageLayout({
      source: SOURCE,
      geometry,
      frame: DEFAULT_FRAME_CONFIG,
      scale: 0.5,
      bounds,
    });

  it("is the base image's move when only the composition around it changes", () => {
    const base = grownBy({ x: 0, y: 0, width: 1, height: 1 });
    expect(baseImageShift(base, base)).toEqual({ x: 0, y: 0 });
    expect(baseImageShift(base, grownBy({ x: 0, y: 0, width: 1.5, height: 1 }))).toEqual({
      x: 0,
      y: 0,
    });
    expect(baseImageShift(base, grownBy({ x: -0.25, y: -0.5, width: 1.25, height: 1.5 }))).toEqual({
      x: 750,
      y: 1000,
    });
    expect(baseImageShift(grownBy({ x: -0.25, y: 0, width: 1.25, height: 1 }), base)).toEqual({
      x: -750,
      y: 0,
    });
  });

  it("is null when the base image itself is drawn differently", () => {
    const base = grownBy({ x: 0, y: 0, width: 1, height: 1 });
    const cropped = computeImageLayout({
      source: SOURCE,
      geometry: { ...geometry, crop: { x: 0, y: 0, width: 0.5, height: 1 } },
      frame: DEFAULT_FRAME_CONFIG,
      scale: 0.5,
    });
    const smaller = computeImageLayout({
      source: SOURCE,
      geometry,
      frame: DEFAULT_FRAME_CONFIG,
      scale: 0.25,
    });
    expect(baseImageShift(base, cropped)).toBeNull();
    expect(baseImageShift(base, smaller)).toBeNull();
    expect(baseImageShift(base, { ...base, baseRadius: 6 })).toBeNull();
  });
});

describe("scaling helpers", () => {
  it("fits edges and canvas areas", () => {
    expect(scaleToFitEdge(SOURCE, 2048)).toBeCloseTo(2048 / 6000);
    expect(scaleToFitEdge({ width: 800, height: 600 }, 2048)).toBe(1);
    const s = scaleToFitArea({ width: 8000, height: 8000 }, 16_000_000);
    expect(8000 * s * 8000 * s).toBeCloseTo(16_000_000, -2);
  });

  it("suggests a frame proportional to the image", () => {
    expect(suggestedFrameSize({ width: 2880, height: 1800 })).toEqual({ padding: 173, radius: 43 });
    expect(suggestedFrameSize({ width: 200, height: 100 }).padding).toBe(24);
  });
});

describe("resolveExportBackground", () => {
  it("paints the frame background unless transparent", () => {
    expect(
      resolveExportBackground({ frame: FRAME_ON, transparent: false, format: "image/png" }).kind,
    ).toBe("frame");
    expect(
      resolveExportBackground({ frame: FRAME_ON, transparent: true, format: "image/png" }).kind,
    ).toBe("transparent");
    expect(
      resolveExportBackground({ frame: FRAME_ON, transparent: true, format: "image/webp" }).kind,
    ).toBe("transparent");
  });

  it("never leaves JPEG transparent", () => {
    expect(
      resolveExportBackground({ frame: FRAME_ON, transparent: true, format: "image/jpeg" }).kind,
    ).toBe("frame");
    expect(
      resolveExportBackground({
        frame: DEFAULT_FRAME_CONFIG,
        transparent: true,
        format: "image/jpeg",
      }).kind,
    ).toBe("matte");
    expect(
      resolveExportBackground({
        frame: { ...FRAME_ON, preset: "none" },
        transparent: false,
        format: "image/jpeg",
      }).kind,
    ).toBe("matte");
  });

  it("names the exported file", () => {
    expect(exportFileName("shot.final.png", "image/jpeg")).toBe("shot.final-edited.jpg");
    expect(exportFileName(".png", "image/webp")).toBe("image-edited.webp");
    expect(exportFileName("photo", "image/png")).toBe("photo-edited.png");
  });
});

describe("redaction pixels", () => {
  it("sizes cells by the long edge so preview and export match", () => {
    const full = redactionCellSize({ intensity: 0.6, imageLongEdge: 6000 });
    const preview = redactionCellSize({ intensity: 0.6, imageLongEdge: 2000 });
    expect(full / preview).toBeCloseTo(3, 0);
    expect(redactionCellSize({ intensity: 0, imageLongEdge: 10 })).toBe(2);
  });

  it("covers every touched pixel", () => {
    expect(
      coverPixels({ x: 0.101, y: 0.2, width: 0.2, height: 0.0999 }, { width: 100, height: 10 }),
    ).toEqual({ x: 10, y: 2, width: 21, height: 1 });
  });
});

describe("image history", () => {
  const redaction = createRedaction({
    id: "r1",
    rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    style: "blackout",
  });

  it("sizes the default frame to the image", () => {
    const { frame } = createImageHistory(SOURCE).present;
    expect(frame.padding).toBe(360);
    expect(frame.radius).toBe(90);
    expect(frame.preset).toBe("hyper");
  });

  it("records document changes and ignores view changes", () => {
    const h0 = createImageHistory(SOURCE);
    const h1 = commitImageState(h0, { ...h0.present, tool: "redact" });
    expect(h1.past).toHaveLength(0);
    const h2 = commitImageState(h1, addImageRedaction(h1.present, redaction));
    expect(h2.past).toHaveLength(1);
    expect(h2.present.selectedRedactionId).toBe("r1");
  });

  it("keeps the tool on undo and drops a selection that no longer exists", () => {
    let h = createImageHistory(SOURCE);
    h = commitImageState(h, addImageRedaction({ ...h.present, tool: "redact" }, redaction));
    h = commitImageState(h, enterFrameTool(h.present, true));
    expect(h.present.frame.enabled).toBe(true);
    h = undoImageState(h);
    expect(h.present.tool).toBe("frame");
    expect(h.present.frame.enabled).toBe(false);
    h = undoImageState(h);
    expect(h.present.redactions).toHaveLength(0);
    expect(h.present.selectedRedactionId).toBeNull();
    h = redoImageState(redoImageState(h));
    expect(h.present.frame.enabled).toBe(true);
    expect(undoImageState(createImageHistory(SOURCE)).past).toHaveLength(0);
  });

  it("restyles the selected redaction", () => {
    const state = addImageRedaction(createImageHistory(SOURCE).present, redaction);
    const next = applyRedactionStyle(state, "pixelate");
    expect(next.redactionStyle).toBe("pixelate");
    expect(next.redactions[0]?.style).toBe("pixelate");
    const none = applyRedactionStyle({ ...state, selectedRedactionId: null }, "blur");
    expect(none.redactions[0]?.style).toBe("blackout");
  });

  it("does not re-enable a frame the user turned off", () => {
    const state = createImageHistory(SOURCE).present;
    expect(enterFrameTool(state, false).frame.enabled).toBe(false);
  });

  it("converts quarter turns", () => {
    expect(quarterTurns(270)).toBe(3);
    expect(rotationFromQuarterTurns(-1)).toBe(270);
    expect(rotationFromQuarterTurns(5)).toBe(90);
  });
});
