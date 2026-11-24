/**
 * Plans the smallest repaint of a redacted canvas when its redaction boxes change, so the live
 * preview re-runs only the boxes a change can reach instead of every blur and pixelate pass.
 *
 * Each box writes whole pixels inside `write` and reads only pixels inside `read` (its write
 * rect grown by the resampling filter's reach). A box's result depends only on the canvas
 * inside `read` at the moment it runs. The plan restores `region` from the unredacted base and
 * re-runs `reapply` in document order. A kept box joins the re-run when its `read` meets the
 * region (its input changed) or its `write` meets the `read` of a re-run box (it would hand that
 * box a pixel from later in the order). So each re-run box reads either restored pixels redone
 * in order, or pixels no box writes, which equal the base: what a full render would show it.
 */
import type { PixelRect } from "./layout";

/** One placed redaction box, in canvas pixels. */
export type RedactionFootprint = {
  /** Equal keys mean an identical effect: same style, cell size and exact pixel rect. */
  readonly key: string;
  /** Whole pixels the box can change. */
  readonly write: PixelRect;
  /** Whole pixels the box's result can depend on; contains `write`. */
  readonly read: PixelRect;
};

export type RedactionRepaintPlan =
  | { readonly kind: "none" }
  | { readonly kind: "full" }
  | {
      readonly kind: "partial";
      /** Restore these from the base image first; integer rects, may overlap. */
      readonly region: readonly PixelRect[];
      /** Indexes into `next`, ascending: the boxes to run again, in document order. */
      readonly reapply: readonly number[];
    };

/** More rects than this and a full repaint is simpler and about as cheap. */
const MAX_REGION_RECTS = 24;

function overlaps(a: PixelRect, b: PixelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function isEmpty(rect: PixelRect): boolean {
  return rect.width <= 0 || rect.height <= 0;
}

/**
 * Indexes of the entries with no counterpart in `other`, matching equal keys one to one from
 * the front, so a duplicated box counts once per copy.
 */
function unmatched(
  items: readonly RedactionFootprint[],
  other: readonly RedactionFootprint[],
): Set<number> {
  const available = new Map<string, number>();
  for (const item of other) available.set(item.key, (available.get(item.key) ?? 0) + 1);
  const result = new Set<number>();
  items.forEach((item, index) => {
    const left = available.get(item.key) ?? 0;
    if (left > 0) available.set(item.key, left - 1);
    else result.add(index);
  });
  return result;
}

/** The repaint that turns a canvas showing `previous` into one showing `next`. */
export function planRedactionRepaint(args: {
  readonly previous: readonly RedactionFootprint[];
  readonly next: readonly RedactionFootprint[];
}): RedactionRepaintPlan {
  const { previous, next } = args;
  const removed = unmatched(previous, next);
  const added = unmatched(next, previous);
  // The boxes on both sides must keep their order, or the overlaps would composite differently.
  const keptBefore = previous.filter((_, index) => !removed.has(index)).map((f) => f.key);
  const keptAfter = next.filter((_, index) => !added.has(index)).map((f) => f.key);
  if (keptBefore.some((key, index) => key !== keptAfter[index])) return { kind: "full" };
  if (removed.size === 0 && added.size === 0) return { kind: "none" };

  // Pixels a removed or added box writes can change; they go back to the base and redo.
  const region: PixelRect[] = [];
  const reads: PixelRect[] = [];
  for (const index of removed) {
    const box = previous[index];
    if (box !== undefined && !isEmpty(box.write)) region.push(box.write);
  }
  const rerun = new Set<number>();
  for (const index of added) {
    const box = next[index];
    if (box === undefined) continue;
    rerun.add(index);
    if (!isEmpty(box.write)) region.push(box.write);
    if (!isEmpty(box.read)) reads.push(box.read);
  }
  // Pull in kept boxes until nothing new joins: one whose input meets the region, or one that
  // writes where a re-run box reads (its old pixels there are from after that box).
  let grew = true;
  while (grew) {
    grew = false;
    next.forEach((box, index) => {
      if (rerun.has(index) || isEmpty(box.write)) return;
      const inputChanged = region.some((rect) => overlaps(rect, box.read));
      const feedsRerun = reads.some((rect) => overlaps(rect, box.write));
      if (!inputChanged && !feedsRerun) return;
      rerun.add(index);
      region.push(box.write);
      reads.push(box.read);
      grew = true;
    });
    if (region.length > MAX_REGION_RECTS) return { kind: "full" };
  }
  const reapply = [...rerun].toSorted((a, b) => a - b);
  return { kind: "partial", region, reapply };
}
