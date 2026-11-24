/**
 * Loads every app font face that hasn't loaded yet. Home only needs JetBrains Mono's `-primary`
 * half (app.css); fetching the rest once the page is idle means no UI text falls back for a glyph
 * that lives in the `-rest` file, and the offline cache holds every face.
 */
export function loadRemainingFonts(): void {
  document.fonts.forEach((face) => {
    if (face.status !== "unloaded") return;
    face.load().catch(() => {
      // Offline or blocked: the browser falls back as it would for any missing font.
    });
  });
}
