import { describe, expect, it } from "vitest";
import {
  addImageAnnotation,
  annotationBounds,
  annotationHandles,
  COMPOSITION_REACH,
  createImageDocument,
  dotGridSpacing,
  imageCompositionBounds,
  parseImageDocumentState,
  placeImageLayer,
  rectFromPoints,
  resizeAnnotation,
  sourceRectToView,
  type CornerHandle,
  type HitContext,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageGeometry,
  type NormalizedRect,
} from "../src/index";

const SOURCE = { width: 400, height: 200 };
const FULL = { x: 0, y: 0, width: 1, height: 1 };

function doc(patch: Partial<ImageDocumentState> = {}): ImageDocumentState {
  return { ...createImageDocument(SOURCE), ...patch };
}

function paste(state: ImageDocumentState, n: number, natural = SOURCE): ImageDocumentState {
  return placeImageLayer({
    state,
    source: SOURCE,
    natural,
    id: `layer-${n}`,
    assetId: `asset-${n}`,
  });
}

function layerViews(state: ImageDocumentState): readonly NormalizedRect[] {
  return state.annotations.flatMap((a) =>
    a.kind === "image" ? [sourceRectToView(a.rect, state)] : [],
  );
}

function insideReach(r: NormalizedRect): boolean {
  const lo = -COMPOSITION_REACH - 1e-9;
  const hi = 1 + COMPOSITION_REACH + 1e-9;
  return r.x >= lo && r.y >= lo && r.x + r.width <= hi && r.y + r.height <= hi;
}

function overlaps(a: NormalizedRect, b: NormalizedRect): boolean {
  const eps = 1e-9;
  return (
    a.x < b.x + b.width - eps &&
    b.x < a.x + a.width - eps &&
    a.y < b.y + b.height - eps &&
    b.y < a.y + a.height - eps
  );
}

describe("pasting many pictures", () => {
  it("wraps to a new row instead of clipping the sixth paste past the composition limit", () => {
    let state = doc();
    for (let n = 1; n <= 6; n++) state = paste(state, n);
    const views = layerViews(state);
    expect(views).toHaveLength(6);
    for (const view of views) expect(insideReach(view)).toBe(true);

    // The first row fills to the right; the overflow starts a row at x = 0 below everything.
    const firstRowTop = views[0]?.y ?? NaN;
    const wrapped = views.filter((v) => v.y > firstRowTop + 0.5);
    expect(wrapped.length).toBeGreaterThan(0);
    expect(wrapped[0]?.x).toBeCloseTo(0);
    expect(wrapped[0]?.y).toBeGreaterThanOrEqual(1);

    // No paste lands on the base image or on another paste, and all stay inside the composition.
    const bounds = imageCompositionBounds(state.annotations, state);
    for (const [i, view] of views.entries()) {
      expect(overlaps(view, FULL)).toBe(false);
      for (const other of views.slice(i + 1)) expect(overlaps(view, other)).toBe(false);
      expect(view.x).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(view.x + view.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-9);
      expect(view.y + view.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-9);
    }
  });

  it("fills a second row left to right before starting a third", () => {
    let state = doc();
    for (let n = 1; n <= 6; n++) state = paste(state, n);
    const views = layerViews(state);
    const rows = new Map<number, NormalizedRect[]>();
    for (const view of views) {
      const key = Math.round(view.y * 1000);
      rows.set(key, [...(rows.get(key) ?? []), view]);
    }
    const second = [...rows.values()][1] ?? [];
    expect(second.length).toBeGreaterThan(1);
    for (let i = 1; i < second.length; i++) {
      expect(second[i]?.x ?? 0).toBeGreaterThan(
        (second[i - 1]?.x ?? 0) + (second[i - 1]?.width ?? 0),
      );
    }
  });

  it("keeps every paste fully inside the reach once there is no room for another row", () => {
    let state = doc();
    for (let n = 1; n <= 40; n++) state = paste(state, n);
    const views = layerViews(state);
    expect(views).toHaveLength(40);
    for (const view of views) expect(insideReach(view)).toBe(true);
  });

  it("shrinks a picture far wider than the reach so it still fits", () => {
    const state = paste(doc(), 1, { width: 100_000, height: 10 });
    const [view] = layerViews(state);
    if (view === undefined) throw new Error("no layer");
    expect(insideReach(view)).toBe(true);
  });

  it("stays inside the reach on a turned canvas too", () => {
    let state = doc({ rotation: 90 });
    for (let n = 1; n <= 8; n++) state = paste(state, n, { width: 300, height: 500 });
    for (const view of layerViews(state)) expect(insideReach(view)).toBe(true);
  });
});

describe("resizing keeps the opposite corner fixed", () => {
  const view = { width: 800, height: 400 };
  const thick = 0.05; // A heavy stroke: its pad is many pixels.
  const orientations: readonly ImageGeometry[] = [0, 90, 180, 270].flatMap((rotation) =>
    [false, true].map((flipX) => ({
      crop: FULL,
      rotation: rotation as ImageGeometry["rotation"],
      flipX,
    })),
  );
  const opposite: Readonly<Record<CornerHandle, CornerHandle>> = {
    nw: "se",
    ne: "sw",
    sw: "ne",
    se: "nw",
  };
  const shapes: readonly ImageAnnotation[] = [
    {
      kind: "rectangle",
      id: "r",
      color: "#ff3b30",
      size: thick,
      rect: { x: 0.3, y: 0.3, width: 0.2, height: 0.25 },
    },
    {
      kind: "pen",
      id: "p",
      color: "#ff3b30",
      size: thick,
      points: [
        { x: 0.3, y: 0.35 },
        { x: 0.42, y: 0.3 },
        { x: 0.5, y: 0.55 },
      ],
    },
    {
      kind: "highlighter",
      id: "h",
      color: "#ffcc00",
      size: thick,
      points: [
        { x: 0.25, y: 0.4 },
        { x: 0.55, y: 0.45 },
      ],
    },
  ];

  for (const geometry of orientations) {
    for (const shape of shapes) {
      it(`${shape.kind} at ${geometry.rotation}° flip=${geometry.flipX}`, () => {
        const context: HitContext = { source: SOURCE, geometry, view };
        const before = annotationHandles(shape, context);
        for (const corner of ["nw", "ne", "sw", "se"] as const) {
          const fixed = before.find((h) => h.handle === opposite[corner])?.point;
          if (fixed === undefined) throw new Error("no handle");
          for (const [dx, dy] of [
            [0.15, 0.1],
            [-0.05, 0.08],
            [0.2, -0.12],
          ] as const) {
            for (const keepAspect of [false, true]) {
              const next = resizeAnnotation({
                annotation: shape,
                handle: corner,
                dx,
                dy,
                context,
                keepAspect,
              });
              const after = annotationHandles(next, context).find(
                (h) => h.handle === opposite[corner],
              )?.point;
              if (after === undefined) throw new Error("no handle");
              // Within a hundredth of a pixel.
              expect(Math.abs((after.x - fixed.x) * view.width)).toBeLessThan(0.01);
              expect(Math.abs((after.y - fixed.y) * view.height)).toBeLessThan(0.01);
            }
          }
        }
      });
    }
  }

  it("moves the dragged corner by exactly the drag", () => {
    const context: HitContext = {
      source: SOURCE,
      geometry: { crop: FULL, rotation: 0, flipX: false },
      view,
    };
    const shape = shapes[0];
    if (shape === undefined) throw new Error("no shape");
    const before = annotationBounds(shape, context);
    const next = resizeAnnotation({
      annotation: shape,
      handle: "se",
      dx: 0.1,
      dy: 0.05,
      context,
      keepAspect: false,
    });
    const after = annotationBounds(next, context);
    expect(after.x + after.width).toBeCloseTo(before.x + before.width + 0.1, 9);
    expect(after.y + after.height).toBeCloseTo(before.y + before.height + 0.05, 9);
  });
});

describe("drawing over pictures beside the base image", () => {
  it("keeps a rectangle that reaches past the base image when given the composition", () => {
    const composition = { x: 0, y: 0, width: 2.5, height: 1.4 };
    expect(rectFromPoints({ x: 1.2, y: 0.2 }, { x: 1.8, y: 1.1 }, composition)).toEqual({
      x: 1.2,
      y: 0.2,
      width: expect.closeTo(0.6, 9),
      height: expect.closeTo(0.9, 9),
    });
    // Still clamped to the composition's edge.
    expect(rectFromPoints({ x: 2, y: 1 }, { x: 3, y: 2 }, composition)).toEqual({
      x: 2,
      y: 1,
      width: 0.5,
      height: expect.closeTo(0.4, 9),
    });
    // Without it, the unit square as before.
    expect(rectFromPoints({ x: 1.2, y: 0.2 }, { x: 1.8, y: 0.6 }).width).toBe(0);
  });
});

const stroke = (
  points: readonly { x: number; y: number }[],
  kind: "pen" | "highlighter" = "pen",
): ImageAnnotation => ({
  kind,
  id: "pen",
  color: "#ff3b30",
  size: 0.005,
  points,
});

describe("restoring saved strokes", () => {
  it("rejects a pen or highlighter with no points", () => {
    const empty = addImageAnnotation(doc(), stroke([]));
    expect(parseImageDocumentState(empty, new Set())).toBeNull();
    const highlighter = addImageAnnotation(doc(), stroke([], "highlighter"));
    expect(parseImageDocumentState(highlighter, new Set())).toBeNull();
  });

  it("rejects non-finite coordinates", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const state = addImageAnnotation(doc(), stroke([{ x: 0.1, y: bad }]));
      expect(parseImageDocumentState(state, new Set())).toBeNull();
    }
  });

  it("still restores a one-point stroke", () => {
    const state = addImageAnnotation(doc(), stroke([{ x: 0.1, y: 0.2 }]));
    expect(parseImageDocumentState(state, new Set())).toEqual(state);
  });
});

describe("stage dot grid", () => {
  it("stays within one octave at every zoom", () => {
    for (let zoom = 0.25; zoom <= 8; zoom *= 1.01) {
      const spacing = dotGridSpacing(zoom);
      expect(spacing).toBeGreaterThanOrEqual(16);
      expect(spacing).toBeLessThan(32);
    }
  });

  it("changes only by exactly a factor of two across an octave edge", () => {
    let previous = dotGridSpacing(0.25);
    for (let zoom = 0.25; zoom <= 8; zoom *= 1.001) {
      const spacing = dotGridSpacing(zoom);
      const ratio = spacing / previous;
      // Either a smooth step with the zoom, or an exact halving.
      const smooth = Math.abs(ratio - 1.001) < 1e-6 || Math.abs(ratio - 1) < 1e-6;
      const halved = Math.abs(ratio * 2 - 1.001) < 1e-6;
      expect(smooth || halved).toBe(true);
      previous = spacing;
    }
  });

  it("is the base spacing at fit and proportional to zoom inside an octave", () => {
    expect(dotGridSpacing(1)).toBe(24);
    expect(dotGridSpacing(1.25)).toBe(30);
    expect(dotGridSpacing(2)).toBe(24);
    expect(dotGridSpacing(0.5)).toBe(24);
  });
});
