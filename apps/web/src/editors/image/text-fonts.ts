/**
 * Counts how many times a face of the canvas text font has finished loading. Text drawn before
 * that used a fallback font, so every canvas holding its glyphs (the stage's cached composition,
 * its work canvas, what the display shows) and every measured text footprint is stale once the
 * count moves. Faces of other families (JetBrains Mono, which only UI text uses) leave it alone.
 */
import { TEXT_FONT_FACES } from "./export-protocol";

const TEXT_FAMILIES: ReadonlySet<string> = new Set(TEXT_FONT_FACES.map((face) => face.family));

let generation = 0;
const listeners = new Set<() => void>();

/** `FontFace.family` may come back quoted, as CSS wrote it. */
function familyName(family: string): string {
  return family.replace(/^["']|["']$/g, "");
}

if (typeof document !== "undefined") {
  document.fonts.addEventListener("loadingdone", (event) => {
    if (!event.fontfaces.some((face) => TEXT_FAMILIES.has(familyName(face.family)))) return;
    generation += 1;
    for (const listener of listeners) listener();
  });
}

/** The current count; a `useSyncExternalStore` snapshot. */
export function textFontGeneration(): number {
  return generation;
}

export function subscribeTextFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
