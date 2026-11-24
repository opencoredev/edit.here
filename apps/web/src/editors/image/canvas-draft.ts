/**
 * The document as a canvas gesture (a stroke, a drag, text being typed) is drafting it, kept
 * outside React state so a pointer move re-renders only what draws it: the stage subscribes to
 * every published draft, the editor and its tool controls only to `getControls`.
 *
 * Moves are published from a task queued behind the input already waiting, so a burst of
 * pointer events costs one render, as React's own batching of them did. A gesture's first draft
 * and its end (null) publish at once.
 */
import { sameAnnotationControls, type ImageDocumentState } from "@edit-here/core";

export type CanvasDraftStore = {
  /** The latest published draft; null when no gesture is drafting. */
  readonly get: () => ImageDocumentState | null;
  /**
   * The draft as the tool controls see it. It is replaced only when the controls would show
   * something else (see `sameAnnotationControls`), so moving a drawing leaves them alone.
   */
  readonly getControls: () => ImageDocumentState | null;
  readonly set: (draft: ImageDocumentState | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
};

export function createCanvasDraftStore(): CanvasDraftStore {
  let published: ImageDocumentState | null = null;
  let controls: ImageDocumentState | null = null;
  let pending: ImageDocumentState | null = null;
  let queued = false;
  const listeners = new Set<() => void>();

  const publish = () => {
    queued = false;
    if (published === pending) return;
    published = pending;
    controls =
      published === null
        ? null
        : controls !== null && sameAnnotationControls(controls, published)
          ? controls
          : published;
    for (const listener of listeners) listener();
  };
  const channel = new MessageChannel();
  channel.port1.addEventListener("message", publish);
  channel.port1.start();

  return {
    get: () => published,
    getControls: () => controls,
    set(draft) {
      pending = draft;
      if (draft === null || published === null) {
        publish();
        return;
      }
      if (queued) return;
      queued = true;
      channel.port2.postMessage(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
