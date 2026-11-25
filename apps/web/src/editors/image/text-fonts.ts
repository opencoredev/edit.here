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

/** A size and weight of the canvas text font, for `document.fonts` checks and loads. */
const TEXT_FONT_PROBE = `600 16px "${TEXT_FONT_FACES[0].family}"`;

/**
 * Runs `run` once the canvas text font has loaded, right away when it already has. A failed
 * load still runs it, with the fallback font, as text drew before.
 */
export function afterTextFont(run: () => void): void {
  if (document.fonts.check(TEXT_FONT_PROBE)) {
    run();
    return;
  }
  void document.fonts.load(TEXT_FONT_PROBE).then(run, run);
}

/** Resolves once the canvas text font has loaded or failed to. */
export function textFontReady(): Promise<void> {
  return new Promise((resolve) => afterTextFont(resolve));
}

export function subscribeTextFonts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
