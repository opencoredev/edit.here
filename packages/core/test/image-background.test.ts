import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  blobStops,
  canvasBackgroundCss,
  createInitialImageState,
  customBackground,
  DEFAULT_FRAME_CONFIG,
  frameBackground,
  gradientLine,
  orientationMatrix,
  orientRect,
  parseImageDocumentState,
  type ImageOrientation,
  type ImageRotation,
} from "../src/index";

const HEX = /^#[0-9a-f]{6}$/;

describe("frame background presets", () => {
  const presets = Object.entries(BACKGROUND_PRESETS).filter(([id]) => id !== "none");

  it("offers 8 to 12 distinct mesh wallpapers", () => {
    expect(presets.length).toBeGreaterThanOrEqual(8);
    expect(presets.length).toBeLessThanOrEqual(12);
    const labels = presets.map(([, preset]) => preset.label);
    expect(new Set(labels).size).toBe(labels.length);
    const bases = presets.map(([, preset]) =>
      preset.background.kind === "mesh" ? preset.background.base : null,
    );
    expect(new Set(bases).size).toBe(bases.length);
  });

  it("keeps every blob inside the canvas, visible and in valid colors", () => {
    for (const [id, preset] of presets) {
      const bg = preset.background;
      expect({ id, kind: bg.kind }).toEqual({ id, kind: "mesh" });
      if (bg.kind !== "mesh") continue;
      expect({ id, base: HEX.test(bg.base) }).toEqual({ id, base: true });
      expect(bg.blobs.length).toBeGreaterThanOrEqual(3);
      expect(bg.blobs.length).toBeLessThanOrEqual(5);
      for (const blob of bg.blobs) {
        expect({ id, color: HEX.test(blob.color) }).toEqual({ id, color: true });
        for (const v of [blob.x, blob.y]) expect(v >= 0 && v <= 1).toBe(true);
        for (const v of [blob.rx, blob.ry]) expect(v > 0 && v <= 1.5).toBe(true);
        expect(blob.opacity > 0 && blob.opacity <= 1).toBe(true);
      }
    }
  });

  it("defaults to Dusk and frames with it", () => {
    expect(DEFAULT_FRAME_CONFIG.preset).toBe("dusk");
    expect(createInitialImageState().frame.preset).toBe("dusk");
    expect(frameBackground({ ...DEFAULT_FRAME_CONFIG, enabled: true })).toBe(
      BACKGROUND_PRESETS.dusk.background,
    );
  });
});

describe("blobStops", () => {
  it("fades the blob's own color from full opacity to nothing", () => {
    const stops = blobStops({ x: 0, y: 0, rx: 1, ry: 1, color: "#ff8000", opacity: 0.5 });
    expect(stops[0]).toEqual({ offset: 0, color: "rgba(255, 128, 0, 0.5)" });
    expect(stops.at(-1)).toEqual({ offset: 1, color: "rgba(255, 128, 0, 0)" });
    expect(stops.find((s) => s.offset === 0.4)?.color).toBe("rgba(255, 128, 0, 0.324)");
    const alphas = stops.map((s) => Number(/, ([\d.]+)\)$/.exec(s.color)?.[1]));
    expect(alphas).toEqual(alphas.toSorted((a, b) => b - a));
  });
});

describe("canvasBackgroundCss", () => {
  it("stacks blobs as elliptical radial gradients over the base color", () => {
    expect(
      canvasBackgroundCss({
        kind: "mesh",
        base: "#101010",
        blobs: [
          { x: 0.1, y: 0.2, rx: 0.5, ry: 0.6, color: "#ff0000", opacity: 1 },
          { x: 0.9, y: 0.8, rx: 0.7, ry: 0.4, color: "#0000ff", opacity: 0.5 },
        ],
      }),
    ).toBe(
      "radial-gradient(70% 40% at 90% 80%, rgba(0, 0, 255, 0.5) 0%, rgba(0, 0, 255, 0.448) 20%, rgba(0, 0, 255, 0.324) 40%, rgba(0, 0, 255, 0.176) 60%, rgba(0, 0, 255, 0.052) 80%, rgba(0, 0, 255, 0) 100%), " +
        "radial-gradient(50% 60% at 10% 20%, rgba(255, 0, 0, 1) 0%, rgba(255, 0, 0, 0.896) 20%, rgba(255, 0, 0, 0.648) 40%, rgba(255, 0, 0, 0.352) 60%, rgba(255, 0, 0, 0.104) 80%, rgba(255, 0, 0, 0) 100%), " +
        "#101010",
    );
  });

  it("writes the custom solid and two-color gradient", () => {
    const custom = { ...DEFAULT_FRAME_CONFIG, customColor: "#123456", customColorEnd: "#abcdef" };
    expect(canvasBackgroundCss(customBackground({ ...custom, customMode: "solid" }))).toBe(
      "#123456",
    );
    expect(
      canvasBackgroundCss(customBackground({ ...custom, customMode: "gradient", customAngle: 90 })),
    ).toBe("linear-gradient(90deg, #123456 0%, #abcdef 100%)");
  });
});

describe("stored frame presets", () => {
  it("maps presets from before the mesh backgrounds to their closest new one", () => {
    const state = createInitialImageState();
    const legacy = {
      hyper: "azure",
      ember: "solstice",
      mojave: "dusk",
      emerald: "lagoon",
      iris: "orchid",
      obsidian: "graphite",
      silver: "mist",
      paper: "linen",
    };
    for (const [old, now] of Object.entries(legacy)) {
      const stored = { ...state, frame: { ...state.frame, preset: old } };
      const preset = parseImageDocumentState(stored, new Set())?.frame.preset;
      expect({ old, preset }).toEqual({ old, preset: now });
    }
    const current = { ...state, frame: { ...state.frame, preset: "linen" } };
    expect(parseImageDocumentState(current, new Set())?.frame.preset).toBe("linen");
    const unknown = { ...state, frame: { ...state.frame, preset: "nope" } };
    expect(parseImageDocumentState(unknown, new Set())).toBeNull();
  });
});

describe("gradientLine", () => {
  it("runs bottom to top at 0deg and left to right at 90deg", () => {
    const up = gradientLine(0, { width: 200, height: 100 });
    expect(up.x0).toBeCloseTo(100);
    expect(up.y0).toBeCloseTo(100);
    expect(up.y1).toBeCloseTo(0);
    const right = gradientLine(90, { width: 200, height: 100 });
    expect(right.x0).toBeCloseTo(0);
    expect(right.x1).toBeCloseTo(200);
  });
});

describe("orientationMatrix", () => {
  const size = { width: 300, height: 200 };
  const rotations: readonly ImageRotation[] = [0, 90, 180, 270];

  it("agrees with orientRect for all eight orientations", () => {
    for (const rotation of rotations) {
      for (const flipX of [false, true]) {
        const o: ImageOrientation = { rotation, flipX };
        const [a, b, c, d, e, f] = orientationMatrix(o, size);
        const map = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });
        const p = map(30, 40);
        const q = map(90, 70);
        const oriented = orientRect({ x: 0.1, y: 0.2, width: 0.2, height: 0.15 }, o);
        const ow = rotation % 180 === 0 ? 300 : 200;
        const oh = rotation % 180 === 0 ? 200 : 300;
        expect(Math.min(p.x, q.x) / ow).toBeCloseTo(oriented.x);
        expect(Math.min(p.y, q.y) / oh).toBeCloseTo(oriented.y);
        expect(Math.abs(p.x - q.x) / ow).toBeCloseTo(oriented.width);
        expect(Math.abs(p.y - q.y) / oh).toBeCloseTo(oriented.height);
      }
    }
  });
});
