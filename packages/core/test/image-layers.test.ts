import { describe, expect, it } from "vitest";
import {
  addImageAnnotation,
  annotationBounds,
  annotationHandles,
  annotationOrder,
  annotationPixelRange,
  annotationSizeFromPixels,
  annotationSizeToPixels,
  annotationToView,
  applyAnnotationStyle,
  bringAnnotationForward,
  compositionPieces,
  computeImageLayout,
  createImageDocument,
  createInitialVideoState,
  DEFAULT_FRAME_CONFIG,
  duplicateImageAnnotation,
  imageCompositionBounds,
  isExpandedComposition,
  matchKeybind,
  parseImageDocumentState,
  parseVideoDocumentState,
  placeImageLayer,
  resizeAnnotation,
  resizeBox,
  selectedAnnotation,
  selectImageTool,
  sendAnnotationBackward,
  sourceRectToView,
  splitVideoAtTime,
  type HitContext,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageGeometry,
  type ImageLayer,
  type NormalizedPoint,
} from "../src/index";

const SOURCE = { width: 400, height: 200 };
const FULL = { x: 0, y: 0, width: 1, height: 1 };
const IDENTITY: ImageGeometry = { crop: FULL, rotation: 0, flipX: false };
const measureText = (value: string, font: number) => value.length * font * 0.5;
const context: HitContext = {
  source: SOURCE,
  geometry: IDENTITY,
  view: { width: 400, height: 200 },
  measureText,
};

function near(expected: NormalizedPoint) {
  return { x: expect.closeTo(expected.x, 9), y: expect.closeTo(expected.y, 9) };
}

const rect = (id = "rect"): ImageAnnotation => ({
  kind: "rectangle",
  id,
  color: "#ff3b30",
  size: 0.005,
  rect: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
});

const layer = (overrides: Partial<ImageLayer> = {}): ImageLayer => ({
  kind: "image",
  id: "layer",
  assetId: "asset",
  rect: { x: 0.1, y: 0.1, width: 0.25, height: 0.5 },
  naturalWidth: 100,
  naturalHeight: 100,
  radius: 0,
  ...overrides,
});

const key = (k: string, mod: boolean) => ({
  key: k,
  metaKey: false,
  ctrlKey: mod,
  shiftKey: false,
  altKey: false,
});

/** A layer's on-screen width over height at identity orientation. */
function shape(l: ImageAnnotation): number {
  if (l.kind !== "image") throw new Error("kind changed");
  return (l.rect.width * SOURCE.width) / (l.rect.height * SOURCE.height);
}

const ids = (s: ImageDocumentState) => s.annotations.map((a) => a.id);

function doc(patch: Partial<ImageDocumentState> = {}): ImageDocumentState {
  return { ...createImageDocument(SOURCE), ...patch };
}

describe("annotation style and selection", () => {
  it("restyles the selected drawing only in select mode", () => {
    const base = doc({ annotations: [rect()], selectedAnnotationId: "rect" });
    const drawing = applyAnnotationStyle({ ...base, tool: "pen" }, { color: "#0a84ff" });
    expect(drawing.annotations[0]).toMatchObject({ color: "#ff3b30" });
    expect(drawing.annotationStyle.color).toBe("#0a84ff");

    const selecting = applyAnnotationStyle({ ...base, tool: "select" }, { color: "#0a84ff" });
    expect(selecting.annotations[0]).toMatchObject({ color: "#0a84ff" });
  });

  it("never gives an image layer a color or size", () => {
    const state = doc({ tool: "select", annotations: [layer()], selectedAnnotationId: "layer" });
    const next = applyAnnotationStyle(state, { color: "#0a84ff", size: 0.02 });
    expect(next.annotations[0]).toEqual(layer());
  });

  it("drops the selection when leaving select mode", () => {
    const state = doc({ tool: "select", annotations: [rect()], selectedAnnotationId: "rect" });
    for (const tool of ["pen", "highlighter", "arrow", "rectangle", "text", "crop"] as const) {
      expect(selectImageTool(state, tool).selectedAnnotationId).toBeNull();
    }
    expect(selectImageTool(state, "select").selectedAnnotationId).toBe("rect");
  });

  it("only reports a selection that is on screen", () => {
    const state = doc({ annotations: [rect()], selectedAnnotationId: "rect" });
    expect(selectedAnnotation({ ...state, tool: "select" })?.id).toBe("rect");
    // A drawing tool just drew it: it is not shown as selected.
    expect(selectedAnnotation({ ...state, tool: "pen" })).toBeNull();
  });

  it("binds duplicate and order shortcuts without clashing with rotate", () => {
    expect(matchKeybind(key("d", true), "image")).toBe("image.duplicate");
    expect(matchKeybind(key("]", true), "image")).toBe("image.bringForward");
    expect(matchKeybind(key("[", true), "image")).toBe("image.sendBackward");
    expect(matchKeybind(key("]", false), "image")).toBe("image.rotate");
  });
});

describe("resize handles", () => {
  it("offers corners for boxes and both ends for arrows", () => {
    expect(annotationHandles(rect(), context).map((h) => h.handle)).toEqual([
      "nw",
      "ne",
      "sw",
      "se",
    ]);
    const arrow: ImageAnnotation = {
      kind: "arrow",
      id: "arrow",
      color: "#ff3b30",
      size: 0.005,
      from: { x: 0.1, y: 0.1 },
      to: { x: 0.5, y: 0.5 },
    };
    expect(annotationHandles(arrow, context)).toEqual([
      { handle: "from", point: near({ x: 0.1, y: 0.1 }) },
      { handle: "to", point: near({ x: 0.5, y: 0.5 }) },
    ]);
  });

  it("drags a box corner freely and keeps the opposite corner", () => {
    const box = { x: 0.2, y: 0.2, width: 0.2, height: 0.2 };
    const next = resizeBox({
      box,
      corner: "se",
      dx: 0.1,
      dy: 0.05,
      view: { width: 400, height: 200 },
      keepAspect: false,
    });
    expect(next.x).toBeCloseTo(0.2);
    expect(next.y).toBeCloseTo(0.2);
    expect(next.width).toBeCloseTo(0.3);
    expect(next.height).toBeCloseTo(0.25);
  });

  it("locks the on-screen shape when asked", () => {
    // 80×40 view pixels; dragging the north-west corner out by 40 px wide keeps 2:1.
    const box = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
    const next = resizeBox({
      box,
      corner: "nw",
      dx: -0.1,
      dy: -0.1,
      view: { width: 400, height: 200 },
      keepAspect: true,
    });
    const ratio = (next.width * 400) / (next.height * 200);
    expect(ratio).toBeCloseTo(2);
    expect(next.x + next.width).toBeCloseTo(0.7);
    expect(next.y + next.height).toBeCloseTo(0.7);
  });

  it("never shrinks a box below the minimum", () => {
    const next = resizeBox({
      box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
      corner: "se",
      dx: -1,
      dy: -1,
      view: { width: 400, height: 200 },
      keepAspect: false,
      minPixels: 10,
    });
    expect(next.width * 400).toBeCloseTo(10);
    expect(next.height * 200).toBeCloseTo(10);
  });

  it("stretches a rectangle from a corner", () => {
    const next = resizeAnnotation({
      annotation: rect(),
      handle: "se",
      dx: 0.1,
      dy: 0.1,
      context,
      keepAspect: false,
    });
    if (next.kind !== "rectangle") throw new Error("kind changed");
    expect(next.rect.x).toBeCloseTo(0.2, 2);
    expect(next.rect.y).toBeCloseTo(0.2, 2);
    expect(next.rect.x + next.rect.width).toBeGreaterThan(0.48);
    expect(next.rect.y + next.rect.height).toBeGreaterThan(0.48);
  });

  it("moves one end of an arrow", () => {
    const arrow: ImageAnnotation = {
      kind: "arrow",
      id: "arrow",
      color: "#ff3b30",
      size: 0.005,
      from: { x: 0.1, y: 0.1 },
      to: { x: 0.5, y: 0.5 },
    };
    const next = resizeAnnotation({
      annotation: arrow,
      handle: "to",
      dx: 0.2,
      dy: -0.1,
      context,
      keepAspect: false,
    });
    if (next.kind !== "arrow") throw new Error("kind changed");
    expect(next.from).toEqual(near({ x: 0.1, y: 0.1 }));
    expect(next.to).toEqual(near({ x: 0.7, y: 0.4 }));
  });

  it("moves arrow ends through a turned canvas", () => {
    const turned: ImageGeometry = { crop: FULL, rotation: 90, flipX: false };
    const arrow: ImageAnnotation = {
      kind: "arrow",
      id: "arrow",
      color: "#ff3b30",
      size: 0.005,
      from: { x: 0.1, y: 0.1 },
      to: { x: 0.5, y: 0.5 },
    };
    const next = resizeAnnotation({
      annotation: arrow,
      handle: "from",
      dx: 0.1,
      dy: 0,
      context: { ...context, geometry: turned },
      keepAspect: false,
    });
    if (next.kind !== "arrow") throw new Error("kind changed");
    const shownBefore = annotationToView(arrow, turned);
    const shownAfter = annotationToView(next, turned);
    expect(shownAfter.from).toEqual(near({ x: shownBefore.from.x + 0.1, y: shownBefore.from.y }));
    expect(next.to).toEqual(near(arrow.to));
  });

  it("scales text from a corner and keeps the opposite corner in place", () => {
    const text: ImageAnnotation = {
      kind: "text",
      id: "text",
      color: "#ff3b30",
      size: 0.005,
      at: { x: 0.2, y: 0.2 },
      text: "Hello",
    };
    const before = annotationBounds(text, context);
    const next = resizeAnnotation({
      annotation: text,
      handle: "se",
      dx: before.width,
      dy: before.height,
      context,
      keepAspect: false,
    });
    if (next.kind !== "text") throw new Error("kind changed");
    expect(next.size).toBeCloseTo(0.01);
    const after = annotationBounds(next, context);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(after.width).toBeCloseTo(before.width * 2);

    const shrunk = resizeAnnotation({
      annotation: text,
      handle: "nw",
      dx: before.width / 2,
      dy: before.height / 2,
      context,
      keepAspect: false,
    });
    const shrunkBox = annotationBounds(shrunk, context);
    expect(shrunkBox.x + shrunkBox.width).toBeCloseTo(before.x + before.width);
    expect(shrunkBox.y + shrunkBox.height).toBeCloseTo(before.y + before.height);
  });

  it("scales a pen stroke's points inside its box", () => {
    const stroke: ImageAnnotation = {
      kind: "pen",
      id: "pen",
      color: "#ff3b30",
      size: 0.005,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.4 },
      ],
    };
    const before = annotationBounds(stroke, context);
    const next = resizeAnnotation({
      annotation: stroke,
      handle: "se",
      dx: before.width,
      dy: 0,
      context,
      keepAspect: false,
    });
    if (next.kind !== "pen") throw new Error("kind changed");
    const [a, b] = next.points;
    // The far point moved twice as far from the fixed corner; the stroke keeps its height.
    expect(b?.x ?? 0).toBeGreaterThan(0.55);
    expect(b?.y ?? 0).toBeCloseTo(0.4);
    expect(a?.x ?? 0).toBeCloseTo(0.2, 1);
  });

  it("resizes an image layer with its shape locked unless told otherwise", () => {
    const original = layer();
    const locked = resizeAnnotation({
      annotation: original,
      handle: "se",
      dx: 0.3,
      dy: 0,
      context,
      keepAspect: true,
    });
    expect(shape(locked)).toBeCloseTo(shape(original));
    if (locked.kind !== "image") throw new Error("kind changed");
    expect(locked.rect.x).toBeCloseTo(0.1);
    expect(locked.rect.width).toBeGreaterThan(original.rect.width);

    const free = resizeAnnotation({
      annotation: original,
      handle: "se",
      dx: 0.3,
      dy: 0,
      context,
      keepAspect: false,
    });
    expect(shape(free)).toBeGreaterThan(shape(original) * 1.5);
  });
});

describe("image layers and composition", () => {
  it("keeps the base image as the whole composition while layers sit on it", () => {
    expect(imageCompositionBounds([], IDENTITY)).toEqual(FULL);
    expect(imageCompositionBounds([rect(), layer()], IDENTITY)).toEqual(FULL);
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: IDENTITY,
      frame: DEFAULT_FRAME_CONFIG,
      bounds: imageCompositionBounds([layer()], IDENTITY),
    });
    expect(layout.content).toEqual(layout.image);
    expect(layout.output).toEqual({ width: 400, height: 200 });
  });

  it("grows the composition to hold a layer beside the base image", () => {
    const beside = layer({ rect: { x: 1.1, y: -0.25, width: 0.5, height: 1 } });
    const bounds = imageCompositionBounds([beside], IDENTITY);
    expect(isExpandedComposition(bounds)).toBe(true);
    expect(bounds).toEqual({ x: 0, y: -0.25, width: 1.6, height: 1.25 });

    const frame = { ...DEFAULT_FRAME_CONFIG, enabled: true, padding: 20, radius: 10 };
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: IDENTITY,
      frame,
      bounds,
      pieces: compositionPieces([beside], IDENTITY),
    });
    expect(layout.content).toEqual({ x: 20, y: 20, width: 640, height: 250 });
    // The base keeps its pixels and moves down to make room above it.
    expect(layout.image).toEqual({ x: 20, y: 70, width: 400, height: 200 });
    expect(layout.output).toEqual({ width: 680, height: 290 });
    // Each piece is rounded on its own instead of the whole composition.
    expect(layout.radius).toBe(0);
    expect(layout.baseRadius).toBe(10);
    expect(layout.shadowShapes).toHaveLength(frame.shadow ? 2 : 0);
  });

  it("keeps base-space coordinates for existing annotations when the composition grows", () => {
    const beside = layer({ rect: { x: -0.5, y: 0, width: 0.4, height: 1 } });
    const layout = computeImageLayout({
      source: SOURCE,
      geometry: IDENTITY,
      frame: { ...DEFAULT_FRAME_CONFIG, enabled: false },
      bounds: imageCompositionBounds([beside], IDENTITY),
    });
    expect(layout.content).toEqual({ x: 0, y: 0, width: 600, height: 200 });
    expect(layout.image.x).toBe(200);
  });

  it("caps how far the composition reaches", () => {
    const far = layer({ rect: { x: 50, y: 0, width: 1, height: 1 } });
    const bounds = imageCompositionBounds([far], IDENTITY);
    expect(bounds.x + bounds.width).toBe(5);
  });

  it("places a pasted picture to the right of the canvas at one pixel per pixel", () => {
    const state = doc({ tool: "pen" });
    const next = placeImageLayer({
      state,
      source: SOURCE,
      natural: { width: 100, height: 50 },
      id: "pasted",
      assetId: "asset-1",
    });
    expect(next.tool).toBe("select");
    expect(next.selectedAnnotationId).toBe("pasted");
    const placed = next.annotations.at(-1);
    if (placed?.kind !== "image") throw new Error("not a layer");
    expect(placed.rect.x).toBeGreaterThan(1);
    expect(placed.rect.y).toBeCloseTo(0);
    expect(placed.rect.width * SOURCE.width).toBeCloseTo(100);
    expect(placed.rect.height * SOURCE.height).toBeCloseTo(50);

    // A second one goes after the first.
    const again = placeImageLayer({
      state: next,
      source: SOURCE,
      natural: { width: 100, height: 50 },
      id: "second",
      assetId: "asset-2",
    });
    const second = again.annotations.at(-1);
    if (second?.kind !== "image") throw new Error("not a layer");
    expect(second.rect.x).toBeGreaterThan(placed.rect.x + placed.rect.width);
  });

  it("shrinks a picture bigger than the base image and keeps its shape on a turned canvas", () => {
    const turned = doc({ rotation: 90 });
    const next = placeImageLayer({
      state: turned,
      source: SOURCE,
      natural: { width: 1600, height: 800 },
      id: "big",
      assetId: "asset",
    });
    const placed = next.annotations.at(-1);
    if (placed?.kind !== "image") throw new Error("not a layer");
    // Source-space shape matches the picture, so drawing it into its rect never stretches it.
    expect((placed.rect.width * SOURCE.width) / (placed.rect.height * SOURCE.height)).toBeCloseTo(
      2,
    );
    expect(
      Math.max(placed.rect.width * SOURCE.width, placed.rect.height * SOURCE.height),
    ).toBeCloseTo(400);
    const shown = sourceRectToView(placed.rect, turned);
    expect(shown.x).toBeGreaterThan(1);
  });
});

describe("paint order and duplicates", () => {
  const three = doc({ annotations: [rect("a"), rect("b"), layer({ id: "c" })] });

  it("brings forward and sends backward one step", () => {
    expect(ids(bringAnnotationForward(three, "a"))).toEqual(["b", "a", "c"]);
    expect(ids(sendAnnotationBackward(three, "c"))).toEqual(["a", "c", "b"]);
  });

  it("does nothing at either end", () => {
    expect(bringAnnotationForward(three, "c")).toBe(three);
    expect(sendAnnotationBackward(three, "a")).toBe(three);
    expect(annotationOrder(three, "c")).toEqual({ atFront: true, atBack: false });
    expect(annotationOrder(three, "a")).toEqual({ atFront: false, atBack: true });
  });

  it("duplicates above the original, offset, and selects the copy", () => {
    const next = duplicateImageAnnotation({
      state: three,
      id: "c",
      newId: "c2",
      offset: { x: 0.05, y: 0.05 },
    });
    expect(ids(next)).toEqual(["a", "b", "c", "c2"]);
    expect(next.selectedAnnotationId).toBe("c2");
    const copy = next.annotations[3];
    if (copy?.kind !== "image") throw new Error("not a layer");
    expect(copy.rect.x).toBeCloseTo(0.15);
    expect(copy.assetId).toBe("asset");
  });
});

describe("size slider", () => {
  it("shows stroke width and font size in image pixels", () => {
    expect(annotationSizeToPixels({ size: 0.005, kind: "pen", longEdge: 1000 })).toBeCloseTo(5);
    expect(annotationSizeToPixels({ size: 0.005, kind: "text", longEdge: 1000 })).toBeCloseTo(25);
    expect(annotationSizeFromPixels({ pixels: 10, kind: "pen", longEdge: 1000 })).toBeCloseTo(0.01);
    expect(annotationSizeFromPixels({ pixels: 1e6, kind: "pen", longEdge: 1000 })).toBe(0.03);
  });

  it("spans a useful range for the image", () => {
    expect(annotationPixelRange({ kind: "pen", longEdge: 1600 })).toEqual({ min: 2, max: 48 });
    expect(annotationPixelRange({ kind: "text", longEdge: 1200 })).toEqual({ min: 6, max: 180 });
  });
});

describe("restoring saved state", () => {
  it("round-trips an image document", () => {
    const state = addImageAnnotation(doc(), layer());
    const json: unknown = JSON.parse(JSON.stringify(state));
    expect(parseImageDocumentState(json, new Set(["asset"]))).toEqual(state);
  });

  it("drops layers whose picture was not saved, and dangling selections", () => {
    const state = addImageAnnotation(doc(), layer());
    const parsed = parseImageDocumentState(state, new Set());
    expect(parsed?.annotations).toEqual([]);
    expect(parsed?.selectedAnnotationId).toBeNull();
  });

  it("rejects anything malformed", () => {
    expect(parseImageDocumentState(null, new Set())).toBeNull();
    expect(parseImageDocumentState({ tool: "select" }, new Set())).toBeNull();
    expect(parseImageDocumentState({ ...doc(), rotation: 45 }, new Set())).toBeNull();
    expect(
      parseImageDocumentState({ ...doc(), crop: { x: 0, y: 0, width: 0, height: 1 } }, new Set()),
    ).toBeNull();
  });

  it("restores video edits only for the same length of video", () => {
    const initial = createInitialVideoState(10);
    const split = {
      ...initial,
      segments: splitVideoAtTime({ segments: initial.segments, time: 4, newId: "s2" }),
    };
    expect(parseVideoDocumentState(split, 10)).toEqual(split);
    expect(parseVideoDocumentState(split, 12)).toBeNull();
    expect(parseVideoDocumentState({ ...split, segments: [] }, 10)).toBeNull();
  });
});
