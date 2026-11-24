import { describe, expect, it } from "vitest";
import {
  addImageRedaction,
  clampNormalizedRect,
  BACKGROUND_PRESETS,
  createInitialImageState,
  createRedaction,
  DEFAULT_FRAME_CONFIG,
  flipImage,
  frameBackgroundCss,
  FULL_RECT,
  isFullRect,
  removeImageRedaction,
  resetImageTransform,
  rotateImage,
  setImageCrop,
  updateImageFrame,
  updateRedaction,
} from "../src/index";

describe("clampNormalizedRect", () => {
  it("keeps a valid rect unchanged", () => {
    expect(clampNormalizedRect({ x: 0.1, y: 0.2, width: 0.5, height: 0.3 })).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.3,
    });
  });

  it("normalizes negative sizes from reverse drags", () => {
    const r = clampNormalizedRect({ x: 0.6, y: 0.5, width: -0.4, height: -0.2 });
    expect(r.x).toBeCloseTo(0.2);
    expect(r.y).toBeCloseTo(0.3);
    expect(r.width).toBeCloseTo(0.4);
    expect(r.height).toBeCloseTo(0.2);
  });

  it("pulls overflowing rects back inside the unit square", () => {
    expect(clampNormalizedRect({ x: 0.8, y: -0.5, width: 0.5, height: 2 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
    });
  });

  it("enforces a minimum size", () => {
    const r = clampNormalizedRect({ x: 0.5, y: 0.5, width: 0, height: 0 }, 0.05);
    expect(r.width).toBe(0.05);
    expect(r.height).toBe(0.05);
  });

  it("treats NaN as the lower bound", () => {
    const r = clampNormalizedRect({ x: Number.NaN, y: 0, width: 0.5, height: 0.5 });
    expect(r.x).toBe(0);
  });
});

describe("image document", () => {
  it("has sensible defaults", () => {
    const s = createInitialImageState();
    expect(s.tool).toBe("select");
    expect(isFullRect(s.crop)).toBe(true);
    expect(s.frame).toEqual(DEFAULT_FRAME_CONFIG);
    expect(s.exportFormat).toBe("image/png");
  });

  it("rotates through four quarter turns", () => {
    let s = createInitialImageState();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = rotateImage(s);
      seen.push(s.rotation);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
  });

  it("flips and resets transforms but keeps redactions", () => {
    const red = createRedaction({ id: "r1", rect: FULL_RECT, style: "blur" });
    let s = addImageRedaction(createInitialImageState(), red);
    s = flipImage(rotateImage(setImageCrop(s, { x: 0.1, y: 0.1, width: 0.5, height: 0.5 })));
    expect(s.flipX).toBe(true);
    s = resetImageTransform(s);
    expect(s.crop).toEqual(FULL_RECT);
    expect(s.rotation).toBe(0);
    expect(s.flipX).toBe(false);
    expect(s.redactions).toHaveLength(1);
  });

  it("adds, selects, updates and removes redactions", () => {
    const red = createRedaction({
      id: "r1",
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
      style: "pixelate",
      intensity: 4,
    });
    expect(red.intensity).toBe(1);
    let s = addImageRedaction(createInitialImageState(), red);
    expect(s.selectedRedactionId).toBe("r1");
    s = { ...s, redactions: updateRedaction(s.redactions, "r1", { style: "blackout" }) };
    expect(s.redactions[0]?.style).toBe("blackout");
    s = removeImageRedaction(s, "r1");
    expect(s.redactions).toEqual([]);
    expect(s.selectedRedactionId).toBeNull();
  });

  it("replaces a redaction with the same id instead of duplicating", () => {
    const a = createRedaction({ id: "r1", rect: FULL_RECT, style: "blur" });
    const s = addImageRedaction(addImageRedaction(createInitialImageState(), a), {
      ...a,
      style: "blackout",
    });
    expect(s.redactions).toHaveLength(1);
    expect(s.redactions[0]?.style).toBe("blackout");
  });

  it("clamps frame padding and radius", () => {
    const s = updateImageFrame(createInitialImageState(), {
      enabled: true,
      padding: -5,
      radius: 9999,
    });
    expect(s.frame.enabled).toBe(true);
    expect(s.frame.padding).toBe(0);
    expect(s.frame.radius).toBe(256);
  });

  it("resolves frame backgrounds", () => {
    expect(
      frameBackgroundCss({
        ...DEFAULT_FRAME_CONFIG,
        preset: "custom",
        customMode: "solid",
        customColor: "#123456",
      }),
    ).toBe("#123456");
    expect(
      frameBackgroundCss({
        ...DEFAULT_FRAME_CONFIG,
        preset: "custom",
        customMode: "gradient",
        customColor: "#123456",
        customColorEnd: "#abcdef",
        customAngle: 90,
      }),
    ).toBe("linear-gradient(90deg, #123456 0%, #abcdef 100%)");
    expect(frameBackgroundCss({ ...DEFAULT_FRAME_CONFIG, preset: "hyper" })).toBe(
      BACKGROUND_PRESETS.hyper.css,
    );
  });

  it("defaults to a framed Hyper gradient and pixelated redactions", () => {
    const state = createInitialImageState();
    expect(state.redactionStyle).toBe("pixelate");
    expect(state.frame.preset).toBe("hyper");
    expect(state.frame.customMode).toBe("gradient");
  });
});
