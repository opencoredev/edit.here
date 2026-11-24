import { describe, expect, it } from "vitest";
import {
  cropFromCenter,
  cropToCenter,
  dragRect,
  flipGeometryX,
  FULL_RECT,
  intersectRects,
  nudgeCrop,
  orientedSize,
  orientRect,
  rectFromPoints,
  rotateGeometryCw,
  sourceRectToView,
  unorientRect,
  viewRectToSource,
  type ImageGeometry,
  type ImageOrientation,
  type ImageRotation,
  type NormalizedRect,
} from "../src/index";

const ROTATIONS: readonly ImageRotation[] = [0, 90, 180, 270];
const ORIENTATIONS: readonly ImageOrientation[] = ROTATIONS.flatMap((rotation) => [
  { rotation, flipX: false },
  { rotation, flipX: true },
]);

const RECT: NormalizedRect = { x: 0.1, y: 0.2, width: 0.3, height: 0.15 };

/** Matches a rect to 9 decimal places. */
function near(rect: NormalizedRect) {
  return {
    x: expect.closeTo(rect.x, 9),
    y: expect.closeTo(rect.y, 9),
    width: expect.closeTo(rect.width, 9),
    height: expect.closeTo(rect.height, 9),
  };
}

/** Where a source pixel lands in the oriented image, computed independently with matrices. */
function orientPoint(p: { x: number; y: number }, o: ImageOrientation) {
  let x = o.flipX ? 1 - p.x : p.x;
  let y = p.y;
  for (let r = 0; r < o.rotation; r += 90) {
    // Clockwise quarter turn in a y-down unit square.
    [x, y] = [1 - y, x];
  }
  return { x, y };
}

describe("orientedSize", () => {
  it("swaps edges for quarter turns", () => {
    expect(orientedSize({ width: 6000, height: 4000 }, 90)).toEqual({ width: 4000, height: 6000 });
    expect(orientedSize({ width: 6000, height: 4000 }, 180)).toEqual({ width: 6000, height: 4000 });
  });
});

describe("orientRect", () => {
  it("is undone by unorientRect for all eight orientations", () => {
    for (const o of ORIENTATIONS) expect(unorientRect(orientRect(RECT, o), o)).toEqual(near(RECT));
  });

  it("matches point-wise orientation of the rect corners", () => {
    for (const o of ORIENTATIONS) {
      const a = orientPoint({ x: RECT.x, y: RECT.y }, o);
      const b = orientPoint({ x: RECT.x + RECT.width, y: RECT.y + RECT.height }, o);
      expect(orientRect(RECT, o)).toEqual(near(rectFromPoints(a, b)));
    }
  });

  it("turns the top-left corner to the top-right on a 90° turn", () => {
    expect(
      orientRect({ x: 0, y: 0, width: 0.2, height: 0.1 }, { rotation: 90, flipX: false }),
    ).toEqual(
      near({
        x: 0.9,
        y: 0,
        width: 0.1,
        height: 0.2,
      }),
    );
  });
});

describe("view mapping", () => {
  const geometry: ImageGeometry = {
    rotation: 90,
    flipX: true,
    crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.6 },
  };

  it("round-trips view → source → view", () => {
    const view = { x: 0.2, y: 0.3, width: 0.4, height: 0.25 };
    expect(sourceRectToView(viewRectToSource(view, geometry), geometry)).toEqual(near(view));
  });

  it("maps the whole view to the crop", () => {
    const source = viewRectToSource(FULL_RECT, geometry);
    expect(orientRect(source, geometry)).toEqual(near(geometry.crop));
  });
});

describe("rotateGeometryCw and flipGeometryX", () => {
  const start: ImageGeometry = {
    rotation: 0,
    flipX: false,
    crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
  };

  it("returns to the start after four turns or two flips", () => {
    let g = start;
    for (let i = 0; i < 4; i++) g = rotateGeometryCw(g);
    expect(g.rotation).toBe(0);
    expect(g.crop).toEqual(near(start.crop));
    const flipped = flipGeometryX(flipGeometryX({ ...start, rotation: 90 }));
    expect(flipped.rotation).toBe(90);
    expect(flipped.flipX).toBe(false);
  });

  it("keeps the crop on the same source pixels when turning or flipping", () => {
    for (const o of ORIENTATIONS) {
      const g: ImageGeometry = { ...o, crop: start.crop };
      const before = unorientRect(g.crop, g);
      for (const next of [rotateGeometryCw(g), flipGeometryX(g)]) {
        expect(unorientRect(next.crop, next)).toEqual(near(before));
      }
    }
  });

  it("flips what the user sees left to right, whatever the turn", () => {
    for (const o of ORIENTATIONS) {
      const g: ImageGeometry = { ...o, crop: FULL_RECT };
      const flipped = flipGeometryX(g);
      const seen = orientRect(RECT, g);
      expect(orientRect(RECT, flipped)).toEqual(near({ ...seen, x: 1 - seen.x - seen.width }));
    }
  });
});

describe("rect editing", () => {
  const rect = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 };

  it("moves inside the unit square", () => {
    expect(dragRect({ rect, handle: "move", dx: 0.9, dy: -0.5 })).toEqual(
      near({
        x: 0.6,
        y: 0,
        width: 0.4,
        height: 0.4,
      }),
    );
  });

  it("resizes from a corner and stops at the minimum size", () => {
    expect(dragRect({ rect, handle: "se", dx: 0.1, dy: 0.2 })).toEqual(
      near({
        x: 0.2,
        y: 0.2,
        width: 0.5,
        height: 0.6,
      }),
    );
    const squashed = dragRect({ rect, handle: "w", dx: 1, dy: 0, minSize: 0.05 });
    expect(squashed.width).toBeCloseTo(0.05);
    expect(squashed.x + squashed.width).toBeCloseTo(0.6);
  });

  it("builds rects from reverse drags", () => {
    expect(rectFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: -0.4 })).toEqual(
      near({
        x: 0.2,
        y: 0,
        width: 0.6,
        height: 0.9,
      }),
    );
  });

  it("nudges a crop by whole pixels and clamps at the edge", () => {
    const crop = { x: 0.5, y: 0.5, width: 0.25, height: 0.25 };
    const moved = nudgeCrop({
      crop,
      oriented: { width: 400, height: 200 },
      dxPixels: 10,
      dyPixels: 0,
    });
    expect(moved.x).toBeCloseTo(0.525);
    const clamped = nudgeCrop({
      crop,
      oriented: { width: 400, height: 200 },
      dxPixels: 1000,
      dyPixels: 0,
    });
    expect(clamped.x).toBeCloseTo(0.75);
  });

  it("intersects rects", () => {
    expect(intersectRects(rect, { x: 0.9, y: 0.9, width: 0.1, height: 0.1 })).toBeNull();
    expect(intersectRects(rect, { x: 0.5, y: 0, width: 1, height: 0.3 }) ?? FULL_RECT).toEqual(
      near({
        x: 0.5,
        y: 0.2,
        width: 0.1,
        height: 0.1,
      }),
    );
  });
});

describe("crop center conversion", () => {
  it("round-trips and snaps float dust to a full rect", () => {
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    expect(cropFromCenter(cropToCenter(crop))).toEqual(near(crop));
    expect(
      cropFromCenter({
        center: { x: 0.5000000001, y: 0.4999999999 },
        size: { width: 1, height: 1 },
      }),
    ).toEqual(FULL_RECT);
  });
});
