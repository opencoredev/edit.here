/**
 * Zoom and pan for the image stage. Zoom is relative to the fitted size (1 = fit to the stage);
 * `x` and `y` are the screen-pixel offset of the image's center from where the fit puts it.
 * Points passed in as anchors are screen pixels relative to that fitted center.
 */
import { clamp } from "../operations";
import type { ImageSize } from "./geometry";

export type Viewport = {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
};

export type ViewPoint = { readonly x: number; readonly y: number };

export const MIN_VIEWPORT_ZOOM = 0.25;
export const MAX_VIEWPORT_ZOOM = 8;
/** One keyboard or button zoom step. */
export const VIEWPORT_ZOOM_STEP = 1.25;

export const FIT_VIEWPORT: Viewport = { zoom: 1, x: 0, y: 0 };

/**
 * Zoom ceiling for a stage whose composition may have grown around the base image. `baseFitK`
 * is screen pixels per output pixel when the unexpanded base fits the stage, `fitK` the same for
 * the shown composition. Growing the composition shrinks `fitK`, so the ceiling rises by the
 * same ratio: the base image's greatest on-screen magnification never drops, and the zoom that
 * keeps the picture still when a growing drag is released is never clipped.
 *
 * There is no separate cap: `COMPOSITION_REACH` already bounds the ratio. The composition spans
 * at most `1 + 2 * COMPOSITION_REACH` base widths and heights, so `baseFitK / fitK` stays at or
 * under that and the ceiling at or under `MAX_VIEWPORT_ZOOM` times it (72 with a reach of 4). A
 * fixed cap below that clipped the release compensation of drags near the reach.
 */
export function stageMaxZoom({ baseFitK, fitK }: { baseFitK: number; fitK: number }): number {
  const ceiling = (MAX_VIEWPORT_ZOOM * baseFitK) / fitK;
  if (!(baseFitK > 0) || !(fitK > 0) || !Number.isFinite(ceiling)) return MAX_VIEWPORT_ZOOM;
  return Math.max(MAX_VIEWPORT_ZOOM, ceiling);
}

/**
 * Clamps `zoom` to `[MIN_VIEWPORT_ZOOM, maxZoom]`. `maxZoom` defaults to `MAX_VIEWPORT_ZOOM`; a
 * stage whose composition grew past the base image raises it so the image keeps the same
 * greatest magnification on screen.
 */
export function clampViewportZoom(zoom: number, maxZoom: number = MAX_VIEWPORT_ZOOM): number {
  return clamp(zoom, MIN_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, maxZoom));
}

export function isFitViewport(viewport: Viewport): boolean {
  return viewport.zoom === 1 && viewport.x === 0 && viewport.y === 0;
}

/** Zooms to `zoom` keeping the image point under `anchor` under it. */
export function zoomViewportAt({
  viewport,
  zoom,
  anchor,
  maxZoom = MAX_VIEWPORT_ZOOM,
}: {
  viewport: Viewport;
  zoom: number;
  anchor: ViewPoint;
  maxZoom?: number | undefined;
}): Viewport {
  const next = clampViewportZoom(zoom, maxZoom);
  const ratio = next / viewport.zoom;
  return {
    zoom: next,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
}

/**
 * Two-finger gesture: the image point that was under the start midpoint follows the current
 * midpoint, and zoom follows the change in finger distance.
 */
export function pinchViewport({
  start,
  from,
  to,
  maxZoom = MAX_VIEWPORT_ZOOM,
}: {
  start: Viewport;
  from: readonly [ViewPoint, ViewPoint];
  to: readonly [ViewPoint, ViewPoint];
  maxZoom?: number | undefined;
}): Viewport {
  const distance = (pair: readonly [ViewPoint, ViewPoint]) =>
    Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const mid = (pair: readonly [ViewPoint, ViewPoint]): ViewPoint => ({
    x: (pair[0].x + pair[1].x) / 2,
    y: (pair[0].y + pair[1].y) / 2,
  });
  const d0 = distance(from);
  const zoom = clampViewportZoom(d0 === 0 ? start.zoom : (start.zoom * distance(to)) / d0, maxZoom);
  const m0 = mid(from);
  const m1 = mid(to);
  // The image point under the start midpoint, in unzoomed pixels from the fitted center.
  const px = (m0.x - start.x) / start.zoom;
  const py = (m0.y - start.y) / start.zoom;
  return { zoom, x: m1.x - zoom * px, y: m1.y - zoom * py };
}

/** The most of the image, per axis, that panning has to leave inside the stage. */
export const MIN_VISIBLE_PIXELS = 80;

/**
 * Lets the image pan freely at any zoom, Figma style, while keeping part of it on screen: on
 * each axis at least `MIN_VISIBLE_PIXELS` of it (or 35% of it, if smaller) stays inside the
 * stage.
 */
export function clampViewport({
  viewport,
  content,
  stage,
  maxZoom = MAX_VIEWPORT_ZOOM,
}: {
  viewport: Viewport;
  /** The fitted image size, before zoom. */
  content: ImageSize;
  stage: ImageSize;
  maxZoom?: number | undefined;
}): Viewport {
  const zoom = clampViewportZoom(viewport.zoom, maxZoom);
  const scaledW = content.width * zoom;
  const scaledH = content.height * zoom;
  const minVisibleX = Math.min(MIN_VISIBLE_PIXELS, scaledW * 0.35);
  const minVisibleY = Math.min(MIN_VISIBLE_PIXELS, scaledH * 0.35);
  const maxX = Math.max(0, (stage.width + scaledW) / 2 - minVisibleX);
  const maxY = Math.max(0, (stage.height + scaledH) / 2 - minVisibleY);
  const x = clamp(viewport.x, -maxX, maxX);
  const y = clamp(viewport.y, -maxY, maxY);
  // Normalize -0 so a centered viewport compares equal to the fit.
  return { zoom, x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

/**
 * Zoom at which one image pixel takes one CSS pixel. `pixels` is the shown image's size in its
 * own pixels; `fitted` is its size on screen at zoom 1.
 */
export function actualSizeZoom({
  pixels,
  fitted,
  maxZoom = MAX_VIEWPORT_ZOOM,
}: {
  pixels: ImageSize;
  fitted: ImageSize;
  maxZoom?: number | undefined;
}): number {
  if (fitted.width <= 0) return 1;
  return clampViewportZoom(pixels.width / fitted.width, maxZoom);
}

/** Converts a wheel event's delta to pixels. `deltaMode` 1 is lines, 2 is pages. */
export function wheelDeltaPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

/**
 * Zoom factor for a Ctrl/Cmd wheel step. Trackpad pinches send small deltas; a mouse notch
 * sends ~100, which is capped so one notch is one comfortable step.
 */
export function wheelZoomFactor(deltaPixels: number): number {
  return Math.exp(-clamp(deltaPixels, -40, 40) * 0.01);
}

/** Stage dot-grid spacing at fit, in screen pixels. */
export const DOT_GRID_BASE = 24;
/** Shown dot spacing stays in `[DOT_GRID_MIN, 2 * DOT_GRID_MIN)`. */
export const DOT_GRID_MIN = 16;

/**
 * Dot spacing for `zoom`: the base spacing scaled with the image, folded into one octave
 * (`[16, 32)` px) by an exact power of two. Crossing an octave edge halves or doubles the
 * spacing, so every other dot stays where it was instead of the grid jumping to an unrelated
 * pitch.
 */
export function dotGridSpacing(zoom: number): number {
  const raw = DOT_GRID_BASE * zoom;
  if (!Number.isFinite(raw) || raw <= 0) return DOT_GRID_BASE;
  const spacing = raw / 2 ** Math.floor(Math.log2(raw / DOT_GRID_MIN));
  // Float error right at an octave edge can land a hair outside the range: fold it back.
  if (spacing >= DOT_GRID_MIN * 2) return spacing / 2;
  if (spacing < DOT_GRID_MIN) return spacing * 2;
  return spacing;
}
