import { describe, expect, it } from "vitest";
import {
  actualSizeZoom,
  clampViewport,
  FIT_VIEWPORT,
  isFitViewport,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  pinchViewport,
  wheelDeltaPixels,
  wheelZoomFactor,
  zoomViewportAt,
  type Viewport,
  type ViewPoint,
} from "../src/index";

/** Where an image point (unzoomed pixels from the fitted center) lands on screen. */
const project = (v: Viewport, p: ViewPoint): ViewPoint => ({
  x: v.x + v.zoom * p.x,
  y: v.y + v.zoom * p.y,
});

describe("zoomViewportAt", () => {
  it("keeps the point under the anchor fixed", () => {
    const start: Viewport = { zoom: 1.5, x: 40, y: -20 };
    const anchor = { x: 120, y: 80 };
    const imagePoint = {
      x: (anchor.x - start.x) / start.zoom,
      y: (anchor.y - start.y) / start.zoom,
    };
    const next = zoomViewportAt({ viewport: start, zoom: 3, anchor });
    expect(next.zoom).toBe(3);
    const landed = project(next, imagePoint);
    expect(landed.x).toBeCloseTo(anchor.x);
    expect(landed.y).toBeCloseTo(anchor.y);
  });

  it("zooms around the center without panning when anchored at 0,0", () => {
    expect(zoomViewportAt({ viewport: FIT_VIEWPORT, zoom: 2, anchor: { x: 0, y: 0 } })).toEqual({
      zoom: 2,
      x: 0,
      y: 0,
    });
  });

  it("clamps zoom to the supported range", () => {
    const anchor = { x: 0, y: 0 };
    expect(zoomViewportAt({ viewport: FIT_VIEWPORT, zoom: 100, anchor }).zoom).toBe(
      MAX_VIEWPORT_ZOOM,
    );
    expect(zoomViewportAt({ viewport: FIT_VIEWPORT, zoom: 0.01, anchor }).zoom).toBe(
      MIN_VIEWPORT_ZOOM,
    );
  });
});

describe("pinchViewport", () => {
  it("zooms by the finger distance ratio and follows the midpoint", () => {
    const start: Viewport = { zoom: 1, x: 0, y: 0 };
    const from = [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ] as const;
    const to = [
      { x: -90, y: 30 },
      { x: 110, y: 30 },
    ] as const;
    const next = pinchViewport({ start, from, to });
    expect(next.zoom).toBeCloseTo(2);
    // The image point under the start midpoint (0,0) is now under the new midpoint (10,30).
    const landed = project(next, { x: 0, y: 0 });
    expect(landed.x).toBeCloseTo(10);
    expect(landed.y).toBeCloseTo(30);
  });

  it("pans without zooming when the fingers move together", () => {
    const start: Viewport = { zoom: 2, x: 10, y: 10 };
    const next = pinchViewport({
      start,
      from: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      to: [
        { x: 20, y: -5 },
        { x: 120, y: -5 },
      ],
    });
    expect(next).toEqual({ zoom: 2, x: 30, y: 5 });
  });
});

/** Length of a centered-at-`center` span of `size` that falls inside a stage of `stageSize`. */
const overlap = (center: number, size: number, stageSize: number) =>
  Math.max(
    0,
    Math.min(center + size / 2, stageSize / 2) - Math.max(center - size / 2, -stageSize / 2),
  );

describe("clampViewport", () => {
  const content = { width: 400, height: 300 };
  const stage = { width: 600, height: 400 };

  /** How much of the image, per axis, is inside the stage. */
  const visible = (v: Viewport) => {
    const w = content.width * v.zoom;
    const h = content.height * v.zoom;
    return { x: overlap(v.x, w, stage.width), y: overlap(v.y, h, stage.height) };
  };

  it("pans freely at fit zoom", () => {
    expect(clampViewport({ viewport: { zoom: 1, x: 80, y: -40 }, content, stage })).toEqual({
      zoom: 1,
      x: 80,
      y: -40,
    });
  });

  it("pans freely when zoomed out", () => {
    expect(clampViewport({ viewport: { zoom: 0.5, x: -150, y: 90 }, content, stage })).toEqual({
      zoom: 0.5,
      x: -150,
      y: 90,
    });
  });

  it.each([0.25, 0.5, 1, 3, 8])("never lets the image leave the stage at %sx", (zoom) => {
    for (const [x, y] of [
      [1e6, 1e6],
      [-1e6, 1e6],
      [1e6, -1e6],
      [-1e6, -1e6],
    ] as const) {
      const clamped = clampViewport({ viewport: { zoom, x, y }, content, stage });
      const seen = visible(clamped);
      const wantX = Math.min(80, content.width * zoom * 0.35);
      const wantY = Math.min(80, content.height * zoom * 0.35);
      expect(seen.x).toBeCloseTo(wantX);
      expect(seen.y).toBeCloseTo(wantY);
    }
  });

  it("stops a fit image with 80px still on screen", () => {
    // At 1x: (600 + 400) / 2 - 80 = 420 horizontally, (400 + 300) / 2 - 80 = 270 vertically.
    const clamped = clampViewport({ viewport: { zoom: 1, x: 900, y: -900 }, content, stage });
    expect(clamped).toEqual({ zoom: 1, x: 420, y: -270 });
  });

  it("keeps an in-range pan", () => {
    expect(clampViewport({ viewport: { zoom: 2, x: 50, y: 20 }, content, stage })).toEqual({
      zoom: 2,
      x: 50,
      y: 20,
    });
  });

  it("leaves the fit viewport untouched", () => {
    expect(clampViewport({ viewport: FIT_VIEWPORT, content, stage })).toEqual(FIT_VIEWPORT);
  });

  it("reports the fit viewport", () => {
    expect(isFitViewport(FIT_VIEWPORT)).toBe(true);
    expect(isFitViewport({ zoom: 1, x: 1, y: 0 })).toBe(false);
  });
});

describe("actualSizeZoom", () => {
  it("is the ratio of image pixels to fitted CSS pixels", () => {
    expect(
      actualSizeZoom({
        pixels: { width: 2400, height: 1600 },
        fitted: { width: 800, height: 533 },
      }),
    ).toBe(3);
  });

  it("stays inside the zoom range", () => {
    expect(
      actualSizeZoom({ pixels: { width: 100, height: 100 }, fitted: { width: 800, height: 800 } }),
    ).toBe(MIN_VIEWPORT_ZOOM);
  });
});

describe("wheel helpers", () => {
  it("converts line and page deltas to pixels", () => {
    expect(wheelDeltaPixels(3, 0, 800)).toBe(3);
    expect(wheelDeltaPixels(3, 1, 800)).toBe(48);
    expect(wheelDeltaPixels(1, 2, 800)).toBe(800);
  });

  it("zooms in on negative deltas and caps a mouse notch", () => {
    expect(wheelZoomFactor(-10)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10)).toBeLessThan(1);
    expect(wheelZoomFactor(100)).toBe(wheelZoomFactor(40));
  });
});
