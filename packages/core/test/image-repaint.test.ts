import { describe, expect, it } from "vitest";
import {
  addImageAnnotation,
  annotationChangeRegion,
  annotationListChange,
  createImageDocument,
  moveAnnotation,
  replaceImageAnnotation,
  sameAnnotationControls,
  unionPixelRects,
  viewRectToCanvasPixels,
  type ImageAnnotation,
  type ImageLayer,
  type PixelRect,
} from "../src/index";

type Pen = Extract<ImageAnnotation, { readonly points: unknown }>;

const stroke = (id: string, x: number): Pen => ({
  kind: "pen",
  id,
  color: "#ff0000",
  size: 0.01,
  points: [
    { x, y: 0.5 },
    { x: x + 0.1, y: 0.5 },
  ],
});

describe("annotationListChange", () => {
  const a = stroke("a", 0.1);
  const b = stroke("b", 0.2);
  const c = stroke("c", 0.3);

  it("sees the same list, by identity or element by element", () => {
    const list = [a, b];
    expect(annotationListChange(list, list)).toEqual({ kind: "same" });
    expect(annotationListChange([a, b], [a, b])).toEqual({ kind: "same" });
    expect(annotationListChange([], [])).toEqual({ kind: "same" });
  });

  it("finds one drawing added on top", () => {
    expect(annotationListChange([a, b], [a, b, c])).toEqual({ kind: "appended", index: 2 });
    expect(annotationListChange([], [a])).toEqual({ kind: "appended", index: 0 });
  });

  it("finds the one drawing a drag replaced", () => {
    const moved = stroke("b", 0.25);
    expect(annotationListChange([a, b, c], [a, moved, c])).toEqual({ kind: "replaced", index: 1 });
  });

  it("gives up on anything else", () => {
    expect(annotationListChange([a, b, c], [a, c])).toEqual({ kind: "other" });
    expect(annotationListChange([a, b], [b, a])).toEqual({ kind: "other" });
    expect(annotationListChange([a, b], [c, a, b])).toEqual({ kind: "other" });
    expect(annotationListChange([a], [a, b, c])).toEqual({ kind: "other" });
  });
});

describe("viewRectToCanvasPixels", () => {
  const base = { x: 100, y: 50, width: 200, height: 100 };
  const size = { width: 400, height: 200 };

  it("maps view space over the base image onto whole canvas pixels, grown by the margin", () => {
    expect(
      viewRectToCanvasPixels({
        view: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
        base,
        margin: 2.5,
        size,
      }),
    ).toEqual({ x: 147, y: 97, width: 106, height: 31 });
  });

  it("clips to the canvas and reports nothing when it is off it", () => {
    expect(
      viewRectToCanvasPixels({
        view: { x: -1, y: -1, width: 3, height: 3 },
        base,
        margin: 0,
        size,
      }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    expect(
      viewRectToCanvasPixels({
        view: { x: 2, y: 0, width: 0.5, height: 0.5 },
        base,
        margin: 1,
        size,
      }),
    ).toBeNull();
  });
});

describe("unionPixelRects", () => {
  it("holds both rects and passes one through when the other is empty", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 20, width: 10, height: 5 };
    expect(unionPixelRects(a, b)).toEqual({ x: 0, y: 0, width: 15, height: 25 });
    expect(unionPixelRects(null, b)).toBe(b);
    expect(unionPixelRects(a, null)).toBe(a);
    expect(unionPixelRects(null, null)).toBeNull();
  });
});

describe("sameAnnotationControls", () => {
  const source = { width: 400, height: 200 };
  const picture: ImageLayer = {
    kind: "image",
    id: "pic",
    assetId: "asset",
    rect: { x: 1.1, y: 0, width: 0.5, height: 0.5 },
    naturalWidth: 800,
    naturalHeight: 800,
    radius: 8,
  };
  const pen = stroke("pen", 0.1);
  const state = {
    ...addImageAnnotation(
      addImageAnnotation({ ...createImageDocument(source), tool: "select" }, picture),
      pen,
    ),
  };
  const move = (id: string, dx: number) => {
    const original = state.annotations.find((a) => a.id === id);
    if (original === undefined) throw new Error("missing");
    return replaceImageAnnotation(
      state,
      moveAnnotation({ annotation: original, dx, dy: 0.1, geometry: state }),
    );
  };

  it("matches states that only move drawings or pictures", () => {
    expect(sameAnnotationControls(state, state)).toBe(true);
    expect(sameAnnotationControls(state, move("pen", 0.2))).toBe(true);
    expect(sameAnnotationControls(state, move("pic", -0.3))).toBe(true);
    expect(
      sameAnnotationControls(
        { ...state, selectedAnnotationId: "pic" },
        { ...move("pic", 0.4), selectedAnnotationId: "pic" },
      ),
    ).toBe(true);
  });

  it("matches a growing stroke draft from one move to the next", () => {
    const first = addImageAnnotation(state, stroke("new", 0.3));
    const later = addImageAnnotation(state, {
      ...stroke("new", 0.3),
      points: [
        { x: 0.3, y: 0.5 },
        { x: 0.5, y: 0.6 },
        { x: 0.7, y: 0.4 },
      ],
    });
    expect(sameAnnotationControls(first, later)).toBe(true);
    expect(sameAnnotationControls(state, first)).toBe(false);
  });

  it("tells apart anything the controls show", () => {
    const selectedPic = { ...state, selectedAnnotationId: "pic" };
    const resized = replaceImageAnnotation(selectedPic, {
      ...picture,
      rect: { ...picture.rect, width: 0.6 },
    });
    const rounded = replaceImageAnnotation(selectedPic, { ...picture, radius: 4 });
    const recolored = replaceImageAnnotation(state, { ...pen, color: "#00ff00" });
    const reordered = { ...state, annotations: state.annotations.toReversed() };
    expect(sameAnnotationControls(selectedPic, resized)).toBe(false);
    expect(sameAnnotationControls(selectedPic, rounded)).toBe(false);
    expect(sameAnnotationControls(state, recolored)).toBe(false);
    expect(sameAnnotationControls(state, reordered)).toBe(false);
    expect(sameAnnotationControls(state, { ...state, tool: "pen" })).toBe(false);
    expect(sameAnnotationControls(state, { ...state, transparent: !state.transparent })).toBe(
      false,
    );
  });
});

// A toy renderer on a small grid that keeps what matters for repaint bounds: a drawing blends
// into each pixel of its footprint on its own, while a picture over redactions rewrites its
// whole footprint from everything under it, as a pixelate or blur box does.
const SIZE = 24;
const picture = (id: string): ImageLayer => ({
  kind: "image",
  id,
  assetId: "asset",
  rect: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
  naturalWidth: 100,
  naturalHeight: 100,
  radius: 0,
});

/** Deterministic PRNG (mulberry32), so a failing case can be replayed. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: number, b: number) => (Math.imul(a ^ b, 0x9e3779b1) + 0x7f4a7c15) | 0;

function paint(args: {
  readonly annotations: readonly ImageAnnotation[];
  readonly footprints: ReadonlyMap<ImageAnnotation, PixelRect | null>;
  readonly tags: ReadonlyMap<ImageAnnotation, number>;
  readonly redacted: boolean;
}): Int32Array {
  const grid = Int32Array.from({ length: SIZE * SIZE }, (_, i) => i * 7919);
  for (const annotation of args.annotations) {
    const r = args.footprints.get(annotation) ?? null;
    const tag = args.tags.get(annotation) ?? 0;
    if (r === null) continue;
    let read = tag;
    for (let y = r.y; y < r.y + r.height; y += 1) {
      for (let x = r.x; x < r.x + r.width; x += 1) {
        const i = y * SIZE + x;
        grid[i] = mix(grid[i] ?? 0, tag);
        read = mix(read, grid[i] ?? 0);
      }
    }
    if (annotation.kind !== "image" || !args.redacted) continue;
    for (let y = r.y; y < r.y + r.height; y += 1) {
      for (let x = r.x; x < r.x + r.width; x += 1) grid[y * SIZE + x] = mix(read, x * 31 + y);
    }
  }
  return grid;
}

describe("annotationChangeRegion", () => {
  it("bounds every pixel a single change can reach, pictures over redactions included", () => {
    const next = random(1234);
    const int = (n: number) => Math.floor(next() * n);
    const footprints = new Map<ImageAnnotation, PixelRect | null>();
    const tags = new Map<ImageAnnotation, number>();
    let counter = 0;
    const make = (): ImageAnnotation => {
      counter += 1;
      const annotation: ImageAnnotation =
        next() < 0.4
          ? { ...picture(`l${counter}`), rect: { x: next(), y: next(), width: 0.2, height: 0.2 } }
          : stroke(`s${counter}`, next());
      const x = int(SIZE - 1);
      const y = int(SIZE - 1);
      footprints.set(
        annotation,
        next() < 0.1 ? null : { x, y, width: 1 + int(SIZE - x), height: 1 + int(SIZE - y) },
      );
      tags.set(annotation, counter * 104729);
      return annotation;
    };

    let regions = 0;
    for (let round = 0; round < 3000; round += 1) {
      const before = Array.from({ length: int(7) }, make);
      const after = [...before];
      if (before.length > 0 && next() < 0.7) after[int(before.length)] = make();
      else after.push(make());
      const redacted = next() < 0.6;
      const repaint = annotationChangeRegion({
        before,
        after,
        footprint: (annotation) => footprints.get(annotation) ?? null,
        redacted,
      });
      if (repaint.kind === "full") continue;
      const a = paint({ annotations: before, footprints, tags, redacted });
      const b = paint({ annotations: after, footprints, tags, redacted });
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] === b[i]) continue;
        const x = i % SIZE;
        const y = Math.floor(i / SIZE);
        expect(repaint.kind, `round ${round}: pixel ${x},${y} changed`).toBe("region");
        if (repaint.kind !== "region") break;
        const r = repaint.rect;
        const inside = x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
        expect(inside, `round ${round}: pixel ${x},${y} outside ${JSON.stringify(r)}`).toBe(true);
      }
      if (repaint.kind === "region") regions += 1;
    }
    // Most changes stay partial: the bound is not just "repaint everything".
    expect(regions).toBeGreaterThan(2000);
  });

  it("grows a drag under a redacted picture to the picture, and only then", () => {
    const pen = stroke("pen", 0.1);
    const moved = stroke("pen", 0.15);
    const layer = picture("layer");
    const rects = new Map<ImageAnnotation, PixelRect>([
      [pen, { x: 10, y: 50, width: 40, height: 4 }],
      [moved, { x: 12, y: 60, width: 40, height: 4 }],
      [layer, { x: 0, y: 40, width: 30, height: 30 }],
    ]);
    const footprint = (annotation: ImageAnnotation) => rects.get(annotation) ?? null;
    const drag = { before: [pen, layer], after: [moved, layer], footprint };
    expect(annotationChangeRegion({ ...drag, redacted: true })).toEqual({
      kind: "region",
      rect: { x: 0, y: 40, width: 52, height: 30 },
    });
    expect(annotationChangeRegion({ ...drag, redacted: false })).toEqual({
      kind: "region",
      rect: { x: 10, y: 50, width: 42, height: 14 },
    });
    // A picture below the change is already in the cache and stays as it was.
    expect(
      annotationChangeRegion({
        before: [layer, pen],
        after: [layer, moved],
        footprint,
        redacted: true,
      }),
    ).toEqual({ kind: "region", rect: { x: 10, y: 50, width: 42, height: 14 } });
  });
});
