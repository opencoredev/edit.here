import { describe, expect, it } from "vitest";
import {
  BACKGROUND_PRESETS,
  DEFAULT_FRAME_CONFIG,
  frameBackgroundCss,
  gradientLine,
  orientationMatrix,
  orientRect,
  parseCanvasBackground,
  type ImageOrientation,
  type ImageRotation,
} from "../src/index";

describe("parseCanvasBackground", () => {
  it("parses every frame preset", () => {
    for (const [name, preset] of Object.entries(BACKGROUND_PRESETS)) {
      expect({ name, parsed: parseCanvasBackground(preset.css) }).not.toMatchObject({
        parsed: null,
      });
    }
  });

  it("reads angle, colors and offsets", () => {
    expect(
      parseCanvasBackground("linear-gradient(135deg, #ff9a5a 0%, #e6517a 55%, #7d43bd 100%)"),
    ).toEqual({
      kind: "linear",
      angle: 135,
      stops: [
        { color: "#ff9a5a", offset: 0 },
        { color: "#e6517a", offset: 0.55 },
        { color: "#7d43bd", offset: 1 },
      ],
    });
    expect(parseCanvasBackground("#f4f1ea")).toEqual({ kind: "solid", color: "#f4f1ea" });
  });

  it("parses the custom solid and two-color gradient", () => {
    const gradient = frameBackgroundCss({
      ...DEFAULT_FRAME_CONFIG,
      preset: "custom",
      customMode: "gradient",
      customColor: "#6366f1",
      customColorEnd: "#ec4899",
      customAngle: 45,
    });
    expect(parseCanvasBackground(gradient)).toEqual({
      kind: "linear",
      angle: 45,
      stops: [
        { color: "#6366f1", offset: 0 },
        { color: "#ec4899", offset: 1 },
      ],
    });
    const solid = frameBackgroundCss({
      ...DEFAULT_FRAME_CONFIG,
      preset: "custom",
      customMode: "solid",
      customColor: "#0ea5e9",
    });
    expect(parseCanvasBackground(solid)).toEqual({ kind: "solid", color: "#0ea5e9" });
  });

  it("spreads stops without offsets and rejects unknown CSS", () => {
    const parsed = parseCanvasBackground("linear-gradient(90deg, rgb(0, 0, 0), red, blue)");
    expect(parsed?.kind === "linear" ? parsed.stops.map((s) => s.offset) : []).toEqual([0, 0.5, 1]);
    expect(parseCanvasBackground("radial-gradient(red, blue)")).toBeNull();
    expect(parseCanvasBackground("url(x.png)")).toBeNull();
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
