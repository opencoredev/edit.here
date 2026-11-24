import { describe, expect, it } from "vitest";
import {
  createImageDocument,
  cropImageLayer,
  FULL_RECT,
  imageLayerCrop,
  imageLayerCropPixels,
  parseImageDocumentState,
  setImageLayerCrop,
  type ImageDocumentState,
  type ImageLayer,
  type NormalizedRect,
} from "../src/index";

const SOURCE = { width: 1000, height: 500 };

const LAYER: ImageLayer = {
  id: "layer-1",
  kind: "image",
  assetId: "asset-1",
  rect: { x: 1.04, y: 0, width: 0.4, height: 0.6 },
  naturalWidth: 400,
  naturalHeight: 300,
  radius: 0,
};

function withLayer(layer: ImageLayer): ImageDocumentState {
  return { ...createImageDocument(SOURCE), annotations: [layer], selectedAnnotationId: layer.id };
}

function expectRect(actual: NormalizedRect, expected: NormalizedRect) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.width).toBeCloseTo(expected.width, 9);
  expect(actual.height).toBeCloseTo(expected.height, 9);
}

describe("image layer crop", () => {
  it("defaults to the whole picture", () => {
    expect(imageLayerCrop(LAYER)).toEqual(FULL_RECT);
    expect(imageLayerCropPixels(LAYER)).toEqual({ width: 400, height: 300 });
  });

  it("keeps the kept pixels in place at the same scale", () => {
    const cropped = cropImageLayer(LAYER, { x: 0.5, y: 0.25, width: 0.5, height: 0.5 });
    expect(cropped.crop).toEqual({ x: 0.5, y: 0.25, width: 0.5, height: 0.5 });
    // The right half, middle band: x moves by half the width, y by a quarter of the height.
    expectRect(cropped.rect, { x: 1.24, y: 0.15, width: 0.2, height: 0.3 });
    // Same picture pixels per base pixel as before, so the piece does not stretch.
    const before = (LAYER.rect.width * SOURCE.width) / LAYER.naturalWidth;
    const after =
      (cropped.rect.width * SOURCE.width) / (LAYER.naturalWidth * (cropped.crop?.width ?? 1));
    expect(after).toBeCloseTo(before, 9);
    expect(imageLayerCropPixels(cropped)).toEqual({ width: 200, height: 150 });
  });

  it("restores the original rect when the crop goes back to the whole picture", () => {
    const cropped = cropImageLayer(LAYER, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const recropped = cropImageLayer(cropped, { x: 0.6, y: 0, width: 0.4, height: 1 });
    const whole = cropImageLayer(recropped, FULL_RECT);
    expectRect(whole.rect, LAYER.rect);
    expect(whole.crop).toEqual(FULL_RECT);
  });

  it("keeps the crop inside the picture", () => {
    const cropped = cropImageLayer(LAYER, { x: 0.8, y: -0.2, width: 0.5, height: 0.5 });
    const crop = imageLayerCrop(cropped);
    expect(crop.x + crop.width).toBeLessThanOrEqual(1);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it("setImageLayerCrop changes only the named image layer", () => {
    const state = withLayer(LAYER);
    const next = setImageLayerCrop({
      state,
      id: LAYER.id,
      crop: { x: 0, y: 0, width: 0.5, height: 1 },
    });
    const [layer] = next.annotations;
    expect(layer?.kind).toBe("image");
    if (layer?.kind !== "image") return;
    expectRect(layer.rect, { x: 1.04, y: 0, width: 0.2, height: 0.6 });
    expect(setImageLayerCrop({ state, id: "missing", crop: FULL_RECT })).toBe(state);
  });
});

describe("image layer crop persistence", () => {
  const assets = new Set([LAYER.assetId]);

  it("round-trips a cropped layer", () => {
    const cropped = setImageLayerCrop({
      state: withLayer(LAYER),
      id: LAYER.id,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    });
    const restored = parseImageDocumentState(JSON.parse(JSON.stringify(cropped)), assets);
    expect(restored).toEqual(cropped);
  });

  it("reads layers saved before cropping existed as uncropped", () => {
    const restored = parseImageDocumentState(JSON.parse(JSON.stringify(withLayer(LAYER))), assets);
    const [layer] = restored?.annotations ?? [];
    expect(layer).toEqual(LAYER);
    expect(layer?.kind === "image" ? imageLayerCrop(layer) : null).toEqual(FULL_RECT);
  });

  it("repairs a stored crop with no area or outside the picture", () => {
    const empty = parseImageDocumentState(
      withLayer({ ...LAYER, crop: { x: 0, y: 0, width: 0, height: 0.5 } }),
      assets,
    );
    const [first] = empty?.annotations ?? [];
    expect(first?.kind === "image" ? first.crop : null).toEqual(FULL_RECT);

    const outside = parseImageDocumentState(
      withLayer({ ...LAYER, crop: { x: 0.9, y: 0, width: 0.5, height: 1 } }),
      assets,
    );
    const [second] = outside?.annotations ?? [];
    const crop = second?.kind === "image" ? imageLayerCrop(second) : FULL_RECT;
    expect(crop.x + crop.width).toBeLessThanOrEqual(1);
  });

  it("rejects a crop that is not a rect", () => {
    const bad = { ...withLayer(LAYER), annotations: [{ ...LAYER, crop: { x: 0 } }] };
    expect(parseImageDocumentState(bad, assets)).toBeNull();
  });
});
