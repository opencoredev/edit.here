import { describe, expect, it } from "vitest";
import { planRedactionRepaint, type PixelRect, type RedactionFootprint } from "../src/index";

const W = 48;
const H = 32;

function box(key: string, write: PixelRect, margin: number): RedactionFootprint {
  const x0 = Math.max(0, write.x - margin);
  const y0 = Math.max(0, write.y - margin);
  const x1 = Math.min(W, write.x + write.width + margin);
  const y1 = Math.min(H, write.y + write.height + margin);
  return { key, write, read: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
}

function inside(rect: PixelRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * A stand-in for a blur or pixelate pass: every written pixel becomes a hash of the box key and
 * every pixel it reads, so any wrong input anywhere in `read` changes the output.
 */
function runBox(grid: number[], footprint: RedactionFootprint): void {
  let h = 0;
  for (const ch of footprint.key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let y = footprint.read.y; y < footprint.read.y + footprint.read.height; y += 1) {
    for (let x = footprint.read.x; x < footprint.read.x + footprint.read.width; x += 1) {
      h = (h * 16777619 + (grid[y * W + x] ?? 0)) >>> 0;
    }
  }
  for (let y = footprint.write.y; y < footprint.write.y + footprint.write.height; y += 1) {
    for (let x = footprint.write.x; x < footprint.write.x + footprint.write.width; x += 1) {
      grid[y * W + x] = (h + x * 7 + y * 13) >>> 0;
    }
  }
}

const baseGrid = (): number[] => Array.from({ length: W * H }, (_, i) => i * 2654435761);

function fullRender(boxes: readonly RedactionFootprint[]): number[] {
  const grid = baseGrid();
  for (const b of boxes) runBox(grid, b);
  return grid;
}

/** Applies a plan the way the canvas cache does. */
function repaint(
  grid: number[],
  previous: readonly RedactionFootprint[],
  next: readonly RedactionFootprint[],
): number[] {
  const plan = planRedactionRepaint({ previous, next });
  switch (plan.kind) {
    case "none":
      return grid;
    case "full":
      return fullRender(next);
    case "partial": {
      const base = baseGrid();
      const out = [...grid];
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          if (plan.region.some((r) => inside(r, x, y))) out[y * W + x] = base[y * W + x] ?? 0;
        }
      }
      for (const index of plan.reapply) {
        const b = next[index];
        if (b !== undefined) runBox(out, b);
      }
      return out;
    }
    default: {
      const _exhaustive: never = plan;
      return _exhaustive;
    }
  }
}

/** Small deterministic PRNG so failures reproduce. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("planRedactionRepaint", () => {
  const a = box("a", { x: 2, y: 2, width: 6, height: 5 }, 2);
  const b = box("b", { x: 30, y: 20, width: 8, height: 6 }, 2);

  it("does nothing when the boxes are unchanged", () => {
    expect(planRedactionRepaint({ previous: [a, b], next: [a, b] })).toEqual({ kind: "none" });
  });

  it("re-runs only the changed box when the others are out of reach", () => {
    const moved = box("a2", { x: 3, y: 2, width: 6, height: 5 }, 2);
    const plan = planRedactionRepaint({ previous: [a, b], next: [moved, b] });
    expect(plan).toEqual({ kind: "partial", region: [a.write, moved.write], reapply: [0] });
  });

  it("pulls in a kept box whose input overlaps the change, and the boxes it reaches", () => {
    const c = box("c", { x: 9, y: 2, width: 4, height: 4 }, 2);
    const d = box("d", { x: 14, y: 2, width: 4, height: 4 }, 2);
    const grown = box("a3", { x: 2, y: 2, width: 7, height: 5 }, 2);
    const plan = planRedactionRepaint({ previous: [a, c, d, b], next: [grown, c, d, b] });
    expect(plan).toMatchObject({ kind: "partial", reapply: [0, 1, 2] });
  });

  it("re-runs a later box that writes where a changed box reads", () => {
    const wide = box("wide", { x: 10, y: 10, width: 4, height: 4 }, 6);
    const late = box("late", { x: 17, y: 10, width: 3, height: 3 }, 0);
    const wider = box("wider", { x: 10, y: 10, width: 5, height: 4 }, 6);
    const plan = planRedactionRepaint({ previous: [wide, late], next: [wider, late] });
    expect(plan).toEqual({
      kind: "partial",
      region: [wide.write, wider.write, late.write],
      reapply: [0, 1],
    });
  });

  it("repaints everything when kept boxes change order", () => {
    expect(planRedactionRepaint({ previous: [a, b], next: [b, a] })).toEqual({ kind: "full" });
  });

  it("matches duplicated boxes one to one", () => {
    const plan = planRedactionRepaint({ previous: [a, a], next: [a] });
    // The copy that stays reads the restored pixels, so it runs again.
    expect(plan).toEqual({ kind: "partial", region: [a.write, a.write], reapply: [0] });
  });

  it("gives the same pixels as a full render over random edit sequences", () => {
    const random = rng(7);
    const int = (n: number) => Math.floor(random() * n);
    const randomBox = (id: number): RedactionFootprint => {
      const width = 1 + int(14);
      const height = 1 + int(10);
      const write = { x: int(W - width + 1), y: int(H - height + 1), width, height };
      return box(`${id}:${write.x},${write.y},${write.width},${write.height}`, write, int(9));
    };
    for (let trial = 0; trial < 600; trial += 1) {
      let boxes: RedactionFootprint[] = [];
      let grid = fullRender(boxes);
      let nextId = 0;
      for (let step = 0; step < 12; step += 1) {
        const next = [...boxes];
        const roll = random();
        if (roll < 0.4 || next.length === 0) next.push(randomBox((nextId += 1)));
        else if (roll < 0.8) next[int(next.length)] = randomBox((nextId += 1));
        else next.splice(int(next.length), 1);
        grid = repaint(grid, boxes, next);
        boxes = next;
        expect(grid).toEqual(fullRender(boxes));
      }
    }
  });
});
