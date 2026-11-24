import type { MediaKind } from "@edit-here/core";
import type { EditorToolbarActions, ExportFormatChoice } from "../editors/types";
import { normalizeExportFormat, type ExportFormat, type OpenSource } from "./analytics";

/**
 * The shell's bookkeeping for product events, kept out of App.tsx so it runs in tests without a
 * DOM. Nothing here reads a file, a file name or anything the visitor typed.
 */

/**
 * Opens that have not reached a working editor yet, by session id. An open counts once its editor
 * has decoded the file (it registers `exportFile`), so a file that fails detection or decoding
 * never reports `editor_opened`, and its entry is dropped as soon as it is no longer the file on
 * screen or the one being detected.
 */
export class PendingOpens {
  readonly #sources = new Map<string, OpenSource>();

  /**
   * A file started opening as session `id`. Reopening the session already on screen (a recent
   * project clicked again while it loads) is not a new open.
   */
  begin(args: {
    readonly id: string;
    readonly source: OpenSource;
    readonly openId: string | undefined;
  }): void {
    if (args.id === args.openId) return;
    this.#sources.set(args.id, args.source);
  }

  /**
   * The editor for `id` could not load its file (a corrupt PNG, an unreadable video). The editor
   * stays on screen with its message, but this is not an open, so the entry goes now.
   */
  fail(id: string): void {
    this.#sources.delete(id);
  }

  /** The editor for `id` is ready: its source the first time, then `undefined`. */
  ready(id: string): OpenSource | undefined {
    const source = this.#sources.get(id);
    this.#sources.delete(id);
    return source;
  }

  /** Forgets every open except these (the session on screen and the one being detected). */
  retain(ids: readonly (string | undefined)[]): void {
    for (const id of this.#sources.keys()) {
      if (!ids.includes(id)) this.#sources.delete(id);
    }
  }

  get size(): number {
    return this.#sources.size;
  }
}

/** An editor's actions as far as "has it opened" goes. */
export type ReadinessActions = Pick<EditorToolbarActions, "exportFile" | "busy">;

/** Whether an editor has finished loading its file: both editors register `exportFile` only then. */
export function editorReady(actions: ReadinessActions): boolean {
  return actions.exportFile !== undefined;
}

/**
 * The `editor_opened` properties once the open session's editor has loaded its file, the first
 * time only; `null` before that, for a file that failed to decode, or once it was counted.
 */
export function readyOpen(args: {
  readonly session: { readonly id: string; readonly kind: MediaKind } | null;
  readonly registered: { readonly sessionId: string; readonly actions: ReadinessActions } | null;
  readonly pending: PendingOpens;
}): { readonly kind: MediaKind; readonly source: OpenSource } | null {
  const { session, registered, pending } = args;
  if (session === null || registered === null || registered.sessionId !== session.id) return null;
  if (!editorReady(registered.actions)) return null;
  const source = pending.ready(session.id);
  return source === undefined ? null : { kind: session.kind, source };
}

/**
 * The format an export really uses, as reported: the one picked from the menu, else the editor's
 * selected one (what `exportFile` falls back to), normalized ("image/png" -> "png"). `undefined`
 * for anything outside the known formats, and the export event is then not sent.
 */
export function resolveExportFormat(
  format: string | undefined,
  formats: Pick<ExportFormatChoice, "selected"> | undefined,
): ExportFormat | undefined {
  return normalizeExportFormat(format ?? formats?.selected);
}

/**
 * Waits for an editor's `copy` result. Only a promise can confirm the copy landed, so a plain
 * return calls neither handler.
 */
export function settleCopy(
  result: void | Promise<void>,
  handlers: { readonly onCopied: () => void; readonly onFailed: () => void },
): void {
  if (!(result instanceof Promise)) return;
  result.then(handlers.onCopied, handlers.onFailed);
}
