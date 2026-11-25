/**
 * Frame backgrounds as data: a solid color, a linear gradient, or a mesh of soft color blobs over
 * a base color. The stage paints them through `canvasBackgroundCss` and exports paint the same
 * definition on a canvas, so the two match.
 */
import type { ImageSize } from "./geometry";

export type GradientStop = { readonly offset: number; readonly color: string };

/**
 * A soft elliptical glow. Its center and radii are fractions of the canvas width and height, and
 * its color fades from `opacity` at the center to nothing at the radius.
 */
export type MeshBlob = {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  /** `#rrggbb`. */
  readonly color: string;
  readonly opacity: number;
};

export type CanvasBackground =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear";
      readonly angle: number;
      readonly stops: readonly [GradientStop, ...GradientStop[]];
    }
  | {
      readonly kind: "mesh";
      /** `#rrggbb`, painted first. */
      readonly base: string;
      /** Painted in order, so the last blob is on top. */
      readonly blobs: readonly MeshBlob[];
    };

/** Falloff from a blob's center (offset 0) to its edge (offset 1): one minus smoothstep. */
const BLOB_FALLOFF = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({
  offset: t,
  alpha: 1 - t * t * (3 - 2 * t),
}));

function hexChannels(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The blob's color stops. Every stop keeps the blob's own color and only alpha falls, so the
 * premultiplied (CSS) and straight (canvas) interpolations agree.
 */
export function blobStops(blob: MeshBlob): readonly GradientStop[] {
  const [r, g, b] = hexChannels(blob.color);
  return BLOB_FALLOFF.map((stop) => ({
    offset: stop.offset,
    color: `rgba(${r}, ${g}, ${b}, ${round(stop.alpha * blob.opacity)})`,
  }));
}

const percent = (fraction: number) => `${round(fraction * 100)}%`;

/** The background as a CSS `background` value. */
export function canvasBackgroundCss(background: CanvasBackground): string {
  switch (background.kind) {
    case "solid":
      return background.color;
    case "linear": {
      const stops = background.stops.map((s) => `${s.color} ${percent(s.offset)}`).join(", ");
      return `linear-gradient(${background.angle}deg, ${stops})`;
    }
    case "mesh": {
      const layers = background.blobs.map((blob) => {
        const stops = blobStops(blob)
          .map((s) => `${s.color} ${percent(s.offset)}`)
          .join(", ");
        return `radial-gradient(${percent(blob.rx)} ${percent(blob.ry)} at ${percent(blob.x)} ${percent(blob.y)}, ${stops})`;
      });
      // CSS stacks the first layer on top; the base color goes last.
      return [...layers.toReversed(), background.base].join(", ");
    }
    default: {
      const _exhaustive: never = background;
      return _exhaustive;
    }
  }
}

/**
 * The CSS gradient line for `angle` over a box: 0deg points up, angles turn clockwise, and the
 * line is long enough that the corners get the first and last stops.
 */
export function gradientLine(
  angle: number,
  size: ImageSize,
): { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number } {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const half =
    (Math.abs(size.width * Math.sin(radians)) + Math.abs(size.height * Math.cos(radians))) / 2;
  const cx = size.width / 2;
  const cy = size.height / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}
