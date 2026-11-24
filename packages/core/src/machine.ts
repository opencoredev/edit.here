import { Effect } from "effect";
import { createEffectActor } from "@xstate/effect";
import { createAsyncLogic, setup, types } from "xstate";
import { detectMediaKind } from "./file-detect";
import type { FileLike, LoadedMediaMeta, MediaKind, ToastMessage, ToastTone } from "./types";

/** How long a toast stays visible before the machine dismisses it (ms). */
export const TOAST_DURATION_MS = 3200;

export type DetectFileResult =
  | { readonly kind: "supported"; readonly mediaKind: MediaKind }
  | { readonly kind: "unsupported"; readonly message: string };

/**
 * Runs the Effect detection program and folds its typed failure into a result value, so
 * the promise never rejects for an unsupported file.
 */
export function runDetectFileEffect(file: FileLike): Promise<DetectFileResult> {
  return Effect.runPromise(
    detectMediaKind(file).pipe(
      Effect.match({
        onFailure: (error): DetectFileResult => ({ kind: "unsupported", message: error.message }),
        onSuccess: (mediaKind): DetectFileResult => ({ kind: "supported", mediaKind }),
      }),
    ),
  );
}

export const detectFileLogic = createAsyncLogic<DetectFileResult, FileLike>({
  run: ({ input }) => runDetectFileEffect(input),
});

export type PendingFile = { readonly id: string; readonly file: FileLike };

export type EditorContext = {
  /** The open document. Kept while detecting or exporting so the editor stays mounted. */
  readonly session: LoadedMediaMeta | null;
  readonly pending: PendingFile | null;
  readonly toast: ToastMessage | null;
  readonly toastSeq: number;
  readonly keybindsOpen: boolean;
  readonly error: string | null;
  readonly exportLabel: string | null;
};

export const initialEditorContext: EditorContext = {
  session: null,
  pending: null,
  toast: null,
  toastSeq: 0,
  keybindsOpen: false,
  error: null,
  exportLabel: null,
};

function toMeta(pending: PendingFile, kind: MediaKind): LoadedMediaMeta {
  return {
    id: pending.id,
    name: pending.file.name,
    mimeType: pending.file.type,
    size: pending.file.size,
    kind,
  };
}

export const editorMachine = setup({
  schemas: {
    context: types<EditorContext>(),
    events: {
      "file.open": types<{ id: string; file: FileLike }>(),
      "session.close": types<{}>(),
      "export.start": types<{ label?: string }>(),
      "export.done": types<{ message: string }>(),
      "export.failed": types<{ message: string }>(),
      "toast.show": types<{ message: string; tone: ToastTone }>(),
      "toast.dismiss": types<{ id: number }>(),
      "keybinds.open": types<{}>(),
      "keybinds.close": types<{}>(),
      "keybinds.toggle": types<{}>(),
      "error.dismiss": types<{}>(),
    },
  },
  actors: { detectFile: detectFileLogic },
}).createMachine({
  id: "editor",
  context: initialEditorContext,
  initial: "idle",
  on: {
    "toast.show": ({ context, event }, enq) => {
      const id = context.toastSeq + 1;
      enq.cancel("toast-timeout");
      enq.raise({ type: "toast.dismiss", id }, { delay: TOAST_DURATION_MS, id: "toast-timeout" });
      return {
        context: {
          ...context,
          toastSeq: id,
          toast: { id, message: event.message, tone: event.tone },
        },
      };
    },
    "toast.dismiss": ({ context, event }) => {
      if (context.toast === null || context.toast.id !== event.id) return;
      return { context: { ...context, toast: null } };
    },
    "keybinds.open": ({ context }) => ({ context: { ...context, keybindsOpen: true } }),
    "keybinds.close": ({ context }) => ({ context: { ...context, keybindsOpen: false } }),
    "keybinds.toggle": ({ context }) => ({
      context: { ...context, keybindsOpen: !context.keybindsOpen },
    }),
  },
  states: {
    idle: {
      on: {
        "file.open": ({ context, event }) => ({
          target: "detecting",
          context: { ...context, pending: { id: event.id, file: event.file }, error: null },
        }),
      },
    },
    detecting: {
      invoke: {
        src: "detectFile",
        input: ({ context }) => context.pending?.file ?? { name: "", type: "", size: 0 },
        onDone: ({ context, event }, enq) => {
          const pending = context.pending;
          const result = event.output;
          if (pending === null) return { target: context.session === null ? "idle" : "editing" };
          if (result.kind === "supported") {
            return {
              target: "editing",
              context: {
                ...context,
                session: toMeta(pending, result.mediaKind),
                pending: null,
                error: null,
              },
            };
          }
          if (context.session !== null) {
            enq.raise({ type: "toast.show", message: result.message, tone: "error" });
            return { target: "editing", context: { ...context, pending: null } };
          }
          return { target: "error", context: { ...context, pending: null, error: result.message } };
        },
        onError: ({ context }) => {
          const message = `Could not read ${context.pending?.file.name ?? "the file"}.`;
          return context.session === null
            ? { target: "error", context: { ...context, pending: null, error: message } }
            : { target: "editing", context: { ...context, pending: null } };
        },
      },
      on: {
        "file.open": ({ context, event }) => ({
          target: "detecting",
          reenter: true,
          context: { ...context, pending: { id: event.id, file: event.file } },
        }),
      },
    },
    editing: {
      on: {
        "file.open": ({ context, event }) => ({
          target: "detecting",
          context: { ...context, pending: { id: event.id, file: event.file } },
        }),
        "session.close": ({ context }) => ({
          target: "idle",
          context: { ...context, session: null, keybindsOpen: false },
        }),
        "export.start": ({ context, event }) => ({
          target: "exporting",
          context: { ...context, exportLabel: event.label ?? "Exporting…" },
        }),
      },
    },
    exporting: {
      on: {
        "export.done": ({ context, event }, enq) => {
          enq.raise({ type: "toast.show", message: event.message, tone: "success" });
          return { target: "editing", context: { ...context, exportLabel: null } };
        },
        "export.failed": ({ context, event }, enq) => {
          enq.raise({ type: "toast.show", message: event.message, tone: "error" });
          return { target: "editing", context: { ...context, exportLabel: null } };
        },
      },
    },
    error: {
      on: {
        "file.open": ({ context, event }) => ({
          target: "detecting",
          context: { ...context, pending: { id: event.id, file: event.file }, error: null },
        }),
        "error.dismiss": ({ context }) => ({
          target: "idle",
          context: { ...context, error: null },
        }),
      },
    },
  },
});

export type EditorMachine = typeof editorMachine;
export type EditorStateValue = "idle" | "detecting" | "editing" | "exporting" | "error";

/**
 * Starts the editor machine inside an Effect scope through `@xstate/effect`. The actor stops
 * when the surrounding scope closes. The browser shell can instead use XState's `createActor`.
 */
export const makeEditorActor = createEffectActor(editorMachine);
