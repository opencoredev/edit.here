/**
 * Parses the CSS backgrounds used by frame presets (a solid color or a `linear-gradient` with
 * an angle and percentage stops) into a form a canvas can paint, so exports match the CSS.
 */
import type { ImageSize } from "./geometry";

export type GradientStop = { readonly offset: number; readonly color: string };

export type CanvasBackground =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear";
      readonly angle: number;
      readonly stops: readonly [GradientStop, ...GradientStop[]];
    };

const LINEAR = /^linear-gradient\(\s*(-?[\d.]+)deg\s*,(.*)\)$/i;
const STOP = /^\s*(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]*\))\s*(?:(-?[\d.]+)%)?\s*$/i;

/** Splits on top-level commas (not the ones inside `rgb(...)`). */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** Returns null for CSS it does not understand; callers fall back to a solid fill. */
export function parseCanvasBackground(css: string): CanvasBackground | null {
  const trimmed = css.trim();
  const linear = LINEAR.exec(trimmed);
  if (linear === null) {
    return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([^)]*\))$/i.test(trimmed)
      ? { kind: "solid", color: trimmed }
      : null;
  }
  const angle = Number(linear[1]);
  const rawStops = splitTopLevel(linear[2] ?? "");
  const stops: GradientStop[] = [];
  for (const [index, raw] of rawStops.entries()) {
    const match = STOP.exec(raw);
    if (match === null || match[1] === undefined) return null;
    const offset =
      match[2] === undefined ? index / Math.max(1, rawStops.length - 1) : Number(match[2]) / 100;
    stops.push({ color: match[1], offset: Math.min(1, Math.max(0, offset)) });
  }
  const [first, ...rest] = stops;
  if (first === undefined || !Number.isFinite(angle)) return null;
  return { kind: "linear", angle, stops: [first, ...rest] };
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
