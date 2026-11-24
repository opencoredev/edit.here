/**
 * Renders and encodes image exports off the main thread, so the page keeps drawing while a large
 * export rasterizes and encodes. Only the editor (`export-client.ts`) talks to this dedicated
 * worker, so its messages are the protocol's types.
 */
import type { ImageDocumentState } from "@edit-here/core";
import { TEXT_FONT_FACES, type ExportRequest, type ExportResponse } from "./export-protocol";
import { exportImageBlob } from "./render";

let textFont: Promise<boolean> | null = null;

/** Loads the text faces into this worker's font set once; false where workers have no fonts. */
function loadTextFont(): Promise<boolean> {
  textFont ??= (async () => {
    const fonts: unknown = Reflect.get(self, "fonts");
    if (typeof FontFace === "undefined" || !(fonts instanceof FontFaceSet)) return false;
    const faces = TEXT_FONT_FACES.map(
      (font) => new FontFace(font.family, font.source, font.descriptors),
    );
    await Promise.all(faces.map((face) => face.load()));
    for (const face of faces) fonts.add(face);
    return true;
  })().catch(() => {
    textFont = null;
    return false;
  });
  return textFont;
}

const hasText = (state: ImageDocumentState): boolean =>
  state.annotations.some((annotation) => annotation.kind === "text");

async function handle(request: ExportRequest): Promise<ExportResponse> {
  const { id } = request;
  try {
    if (typeof OffscreenCanvas === "undefined") return { id, kind: "unsupported" };
    if (hasText(request.state) && !(await loadTextFont())) return { id, kind: "unsupported" };
    const blob = await exportImageBlob({
      source: request.source,
      sourceSize: request.sourceSize,
      state: request.state,
      layers: new Map(request.layers),
      format: request.format,
    });
    return { id, kind: "done", blob };
  } catch (cause) {
    return {
      id,
      kind: "failed",
      message: cause instanceof Error ? cause.message : "The image could not be exported.",
    };
  } finally {
    request.source.close();
    for (const [, bitmap] of request.layers) bitmap.close();
  }
}

self.addEventListener("message", (event: MessageEvent<ExportRequest>) => {
  void handle(event.data).then((response) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker posts to its page; there is no origin to name
    self.postMessage(response);
  });
});
