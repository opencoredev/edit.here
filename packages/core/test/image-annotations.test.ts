import { describe, expect, it } from "vitest";
import {
  addImageAnnotation,
  annotationAt,
  annotationBounds,
  annotationLineWidth,
  annotationToSource,
  annotationToView,
  applyAnnotationStyle,
  commitImageState,
  createImageHistory,
  flipGeometryX,
  HIGHLIGHTER_WIDTH_FACTOR,
  isDrawingTool,
  isUsableAnnotation,
  matchKeybind,
  moveAnnotation,
  orientPoint,
  redoImageState,
  removeImageAnnotation,
  rotateGeometryCw,
  sourcePointToView,
  textAnchorCorner,
  textAnchorFromTopLeft,
  textAnnotationBox,
  undoImageState,
  unorientPoint,
  viewPointToSource,
  orientedSize,
  viewScale,
  type ImageAnnotation,
  type ImageGeometry,
  type NormalizedPoint,
} from "../src/index";

const FULL = { x: 0, y: 0, width: 1, height: 1 };
const IDENTITY: ImageGeometry = { crop: FULL, rotation: 0, flipX: false };
const SOURCE = { width: 400, height: 200 };

/** Matcher for a point equal to `expected` up to float error. */
function near(expected: NormalizedPoint) {
  return { x: expect.closeTo(expected.x, 9), y: expect.closeTo(expected.y, 9) };
}

const measureText = (value: string, font: number) => value.length * font;

const colorOf = (annotation: ImageAnnotation | undefined): string | null =>
  annotation === undefined || annotation.kind === "image" ? null : annotation.color;

const press = (key: string) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
});

const pen = (points: NormalizedPoint[]): ImageAnnotation => ({
  kind: "pen",
  id: "pen",
  color: "#ff3b30",
  size: 0.005,
  points,
});

describe("annotation points", () => {
  it("round-trips through every orientation", () => {
    const point = { x: 0.2, y: 0.7 };
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flipX of [false, true]) {
        expect(unorientPoint(orientPoint(point, { rotation, flipX }), { rotation, flipX })).toEqual(
          near(point),
        );
      }
    }
  });

  it("turns with the image: the top-left corner goes to the top-right on a clockwise turn", () => {
    expect(orientPoint({ x: 0, y: 0 }, { rotation: 90, flipX: false })).toEqual(
      near({ x: 1, y: 0 }),
    );
    expect(orientPoint({ x: 0.25, y: 0.5 }, { rotation: 0, flipX: true })).toEqual(
      near({ x: 0.75, y: 0.5 }),
    );
  });

  it("stays on the same source pixel when the user rotates and flips", () => {
    // A mark drawn at the view's top-left quarter, then the image is turned and mirrored.
    const drawnAt = { x: 0.25, y: 0.25 };
    const stored = viewPointToSource(drawnAt, IDENTITY);
    const turned = rotateGeometryCw(IDENTITY);
    // Turning clockwise moves the top-left quarter to the top-right quarter.
    expect(sourcePointToView(stored, turned)).toEqual(near({ x: 0.75, y: 0.25 }));
    const mirrored = flipGeometryX(turned);
    expect(sourcePointToView(stored, mirrored)).toEqual(near({ x: 0.25, y: 0.25 }));
  });

  it("maps through the crop and back", () => {
    const geometry: ImageGeometry = {
      crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      rotation: 0,
      flipX: false,
    };
    expect(sourcePointToView({ x: 0.75, y: 0.75 }, geometry)).toEqual(near({ x: 0.5, y: 0.5 }));
    // Outside the crop maps outside 0..1, so the renderer clips it away.
    expect(sourcePointToView({ x: 0.1, y: 0.1 }, geometry).x).toBeLessThan(0);
    expect(viewPointToSource({ x: 0.5, y: 0.5 }, geometry)).toEqual(near({ x: 0.75, y: 0.75 }));
  });

  it("converts whole annotations both ways", () => {
    const geometry: ImageGeometry = {
      crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      rotation: 270,
      flipX: true,
    };
    const drawn: ImageAnnotation = {
      kind: "rectangle",
      id: "r",
      color: "#000000",
      size: 0.01,
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    const back = annotationToView(annotationToSource(drawn, geometry), geometry);
    expect(back.kind).toBe("rectangle");
    if (back.kind !== "rectangle") return;
    expect(back.rect.x).toBeCloseTo(0.1, 9);
    expect(back.rect.y).toBeCloseTo(0.2, 9);
    expect(back.rect.width).toBeCloseTo(0.3, 9);
    expect(back.rect.height).toBeCloseTo(0.4, 9);
  });

  it("moves by a view offset, whatever the orientation", () => {
    const geometry = rotateGeometryCw(IDENTITY);
    const arrow: ImageAnnotation = {
      kind: "arrow",
      id: "a",
      color: "#000000",
      size: 0.005,
      from: viewPointToSource({ x: 0.1, y: 0.1 }, geometry),
      to: viewPointToSource({ x: 0.3, y: 0.1 }, geometry),
    };
    const moved = annotationToView(
      moveAnnotation({ annotation: arrow, dx: 0.2, dy: 0.05, geometry }),
      geometry,
    );
    if (moved.kind !== "arrow") throw new Error("expected an arrow");
    expect(moved.from).toEqual(near({ x: 0.3, y: 0.15 }));
    expect(moved.to).toEqual(near({ x: 0.5, y: 0.15 }));
  });
});

describe("annotation sizes", () => {
  it("scales stroke width with the long edge and the view", () => {
    const scale = viewScale({ source: SOURCE, geometry: IDENTITY, viewWidth: 200 });
    expect(scale).toBeCloseTo(0.5);
    expect(annotationLineWidth({ kind: "pen", size: 0.01 }, SOURCE, scale)).toBeCloseTo(2);
    expect(annotationLineWidth({ kind: "highlighter", size: 0.01 }, SOURCE, scale)).toBeCloseTo(
      2 * HIGHLIGHTER_WIDTH_FACTOR,
    );
  });

  it("uses the cropped width for the view scale", () => {
    const cropped: ImageGeometry = { ...IDENTITY, crop: { x: 0, y: 0, width: 0.5, height: 1 } };
    expect(viewScale({ source: SOURCE, geometry: cropped, viewWidth: 200 })).toBeCloseTo(1);
  });
});

describe("hit testing", () => {
  const context = { source: SOURCE, geometry: IDENTITY, view: { width: 400, height: 200 } };

  it("hits a stroke near its line and misses away from it", () => {
    const stroke = pen([
      { x: 0.1, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ]);
    expect(annotationAt({ annotations: [stroke], point: { x: 0.5, y: 0.51 }, context })?.id).toBe(
      "pen",
    );
    expect(annotationAt({ annotations: [stroke], point: { x: 0.5, y: 0.8 }, context })).toBeNull();
  });

  it("hits a rectangle on its outline, not in its middle", () => {
    const rect: ImageAnnotation = {
      kind: "rectangle",
      id: "rect",
      color: "#000000",
      size: 0.005,
      rect: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    };
    expect(annotationAt({ annotations: [rect], point: { x: 0.2, y: 0.5 }, context })?.id).toBe(
      "rect",
    );
    expect(annotationAt({ annotations: [rect], point: { x: 0.5, y: 0.5 }, context })).toBeNull();
  });

  it("hits text inside its measured box", () => {
    const text: ImageAnnotation = {
      kind: "text",
      id: "t",
      color: "#000000",
      size: 0.01,
      at: { x: 0.1, y: 0.1 },
      text: "Hello",
    };
    const measured = { ...context, measureText };
    // Font: 0.01 × 400 × 1 × 5 = 20px, so "Hello" is 100px (0.25) wide and 25px tall.
    const bounds = annotationBounds(text, measured);
    expect(bounds.width).toBeCloseTo(0.25);
    expect(
      annotationAt({ annotations: [text], point: { x: 0.3, y: 0.15 }, context: measured })?.id,
    ).toBe("t");
    expect(
      annotationAt({ annotations: [text], point: { x: 0.6, y: 0.15 }, context: measured }),
    ).toBeNull();
  });

  it("returns the topmost annotation", () => {
    const a = {
      ...pen([
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
      id: "below",
    };
    const b = {
      ...pen([
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
      id: "above",
    };
    expect(annotationAt({ annotations: [a, b], point: { x: 0.5, y: 0.5 }, context })?.id).toBe(
      "above",
    );
  });
});

describe("annotation documents", () => {
  it("adds, restyles and removes drawings through undo history", () => {
    const stroke = pen([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ]);
    let h = createImageHistory(SOURCE);
    h = commitImageState(h, addImageAnnotation({ ...h.present, tool: "pen" }, stroke));
    expect(h.present.annotations).toHaveLength(1);
    expect(h.present.selectedAnnotationId).toBe("pen");

    // Restyling the drawing takes select mode, where its selection box is on screen.
    h = commitImageState(h, { ...h.present, tool: "select" });
    h = commitImageState(h, applyAnnotationStyle(h.present, { color: "#0a84ff" }));
    expect(colorOf(h.present.annotations[0])).toBe("#0a84ff");
    expect(h.present.annotationStyle.color).toBe("#0a84ff");

    h = commitImageState(h, removeImageAnnotation(h.present, "pen"));
    expect(h.present.annotations).toHaveLength(0);
    expect(h.present.selectedAnnotationId).toBeNull();

    h = undoImageState(h);
    expect(colorOf(h.present.annotations[0])).toBe("#0a84ff");
    h = undoImageState(h);
    expect(colorOf(h.present.annotations[0])).toBe("#ff3b30");
    // View fields survive undo: the tool and the chosen color stay.
    expect(h.present.tool).toBe("select");
    expect(h.present.annotationStyle.color).toBe("#0a84ff");
    h = redoImageState(redoImageState(h));
    expect(h.present.annotations).toHaveLength(0);
  });

  it("changing only the drawing style with nothing selected is not an undo step", () => {
    const h = createImageHistory(SOURCE);
    const next = commitImageState(h, applyAnnotationStyle(h.present, { size: 0.01 }));
    expect(next.past).toHaveLength(0);
    expect(next.present.annotationStyle.size).toBe(0.01);
  });

  it("opens in select mode, not crop", () => {
    expect(createImageHistory(SOURCE).present.tool).toBe("select");
  });

  it("ignores clicks that draw nothing", () => {
    const view = { width: 400, height: 200 };
    expect(isUsableAnnotation(pen([{ x: 0.5, y: 0.5 }]), view)).toBe(false);
    expect(
      isUsableAnnotation(
        pen([
          { x: 0.5, y: 0.5 },
          { x: 0.6, y: 0.5 },
        ]),
        view,
      ),
    ).toBe(true);
    expect(
      isUsableAnnotation(
        { kind: "text", id: "t", color: "#000", size: 0.005, at: { x: 0, y: 0 }, text: "  " },
        view,
      ),
    ).toBe(false);
  });

  it("knows which tools draw", () => {
    expect(isDrawingTool("highlighter")).toBe(true);
    expect(isDrawingTool("crop")).toBe(false);
  });
});

describe("drawing shortcuts", () => {
  it("binds one free letter per tool", () => {
    const cases: Array<[string, string]> = [
      ["v", "image.select"],
      ["p", "image.pen"],
      ["h", "image.highlighter"],
      ["a", "image.arrow"],
      ["u", "image.rectangle"],
      ["x", "image.text"],
      ["c", "image.crop"],
      ["r", "image.redact"],
      ["b", "image.frame"],
      ["t", "image.transparent"],
      ["Enter", "image.done"],
    ];
    for (const [key, action] of cases) expect(matchKeybind(press(key), "image")).toBe(action);
  });
});

/** Wide glyphs, like a row of capital Ws. */
const wide = (value: string, font: number) => value.length * font * 0.9;

/** The geometry after the user turns `turns` times, then flips when `flip` is set. */
function oriented(turns: number, flip: boolean): ImageGeometry {
  let geometry = IDENTITY;
  for (let i = 0; i < turns; i += 1) geometry = rotateGeometryCw(geometry);
  return flip ? flipGeometryX(geometry) : geometry;
}

describe("text boxes under flips and turns", () => {
  const photo = { width: 6000, height: 4000 };
  const label: ImageAnnotation = {
    kind: "text",
    id: "label",
    color: "#ff3b30",
    size: 0.005,
    at: { x: 0.05, y: 0.05 },
    text: "WWWWWWWWWWWW",
  };

  const boundsIn = (geometry: ImageGeometry) => {
    const size = orientedSize(photo, geometry.rotation);
    const view = { width: size.width / 10, height: size.height / 10 };
    return annotationBounds(label, { source: photo, geometry, view, measureText: wide });
  };

  it("anchors the source's top-left corner to the matching corner of the upright box", () => {
    expect(textAnchorCorner({ rotation: 0, flipX: false })).toEqual({
      right: false,
      bottom: false,
    });
    expect(textAnchorCorner({ rotation: 0, flipX: true })).toEqual({ right: true, bottom: false });
    expect(textAnchorCorner({ rotation: 90, flipX: false })).toEqual({
      right: true,
      bottom: false,
    });
    expect(textAnchorCorner({ rotation: 180, flipX: false })).toEqual({
      right: true,
      bottom: true,
    });
    expect(textAnchorCorner({ rotation: 270, flipX: false })).toEqual({
      right: false,
      bottom: true,
    });
  });

  it("keeps a label near the top-left edge inside the image in every orientation", () => {
    for (const flip of [false, true]) {
      for (const turns of [0, 1, 2, 3]) {
        const box = boundsIn(oriented(turns, flip));
        expect(box.width).toBeGreaterThan(0.1);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1);
        expect(box.y + box.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it("mirrors to the right edge when flipped", () => {
    const upright = boundsIn(IDENTITY);
    const flipped = boundsIn(flipGeometryX(IDENTITY));
    expect(upright.x).toBeCloseTo(0.05);
    expect(flipped.x + flipped.width).toBeCloseTo(0.95);
    expect(flipped.y).toBeCloseTo(upright.y);
  });

  it("returns to the exact original box after two flips or four turns", () => {
    const original = boundsIn(IDENTITY);
    expect(boundsIn(flipGeometryX(flipGeometryX(IDENTITY)))).toEqual(original);
    expect(boundsIn(oriented(4, false))).toEqual(original);
    const flippedTurned = oriented(1, true);
    expect(boundsIn(flipGeometryX(flipGeometryX(flippedTurned)))).toEqual(boundsIn(flippedTurned));
  });

  it("finds the anchor that puts the box's top-left where the text was typed", () => {
    for (const flip of [false, true]) {
      for (const turns of [0, 1, 2, 3]) {
        const geometry = oriented(turns, flip);
        const layout = {
          text: "Two\nlines",
          fontSize: 20,
          view: { width: 600, height: 400 },
          orientation: geometry,
          measure: wide,
        };
        const topLeft = { x: 0.3, y: 0.4 };
        const anchor = textAnchorFromTopLeft({ ...layout, topLeft });
        const box = textAnnotationBox({ ...layout, anchor });
        expect({ x: box.x, y: box.y }).toEqual(near(topLeft));
      }
    }
  });
});
