import type { FileLike, LoadedMediaMeta, ToastTone } from "@edit-here/core";

/**
 * Actions an editor exposes to the shell header and global shortcuts (Mod+Z, Mod+Shift+Z,
 * Mod+C, Mod+E). Register them with `onRegisterActions` whenever they change; omit an action
 * to hide or disable its button.
 */
export type EditorToolbarActions = {
  /**
   * What the header's main button does. `export` (the default) downloads the result and the
   * button's menu picks the format. `copy` copies the result, and the menu downloads straight
   * away in the format picked; only images use it, since browsers can't put a video on the
   * clipboard.
   */
  primaryAction?: "export" | "copy";
  /**
   * Copy the current result to the clipboard. The editor reports errors itself. Return a
   * promise that resolves once the copy landed to show "Copied" on a `copy` main button.
   */
  copy?: () => void | Promise<void>;
  /**
   * Render and download the result, in `format` (an `exportFormats` option id) when given, else
   * in the selected format. The shell shows progress while the promise is pending and then the
   * success toast, naming the file that was written, or the error toast; editors don't toast on
   * their own. Reject (throw) to report a failure.
   */
  exportFile?: (format?: string) => Promise<ExportedFile>;
  undo?: () => void;
  redo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Export button label, e.g. "Export PNG". */
  exportLabel?: string;
  /** Copy button label, e.g. "Copy image". */
  copyLabel?: string;
  /** Output formats, chosen from a menu attached to the Export button. */
  exportFormats?: ExportFormatChoice;
  /** True while the editor is busy (decoding, rendering); disables export. */
  busy?: boolean;
  /**
   * Accept extra dropped or pasted files without replacing the session (the image editor adds
   * pictures to its canvas). When set, the drop overlay offers an add target next to "Open as
   * new file", and a paste of an accepted file adds it.
   */
  appendFiles?: (files: readonly File[]) => void;
  /** Which files `appendFiles` takes; others open as a new file. */
  canAppend?: (file: FileLike) => boolean;
  /** The drop overlay's add target, e.g. "Add to canvas". */
  appendLabel?: string;
  /** One line under `appendLabel`, e.g. "Place it next to this image". */
  appendDetail?: string;
};

/** The file an export downloaded. */
export type ExportedFile = {
  /** The name it was saved under, with the extension of the bytes it holds. */
  readonly fileName: string;
};

export type ExportFormatChoice = {
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
};

export type StatusTone = ToastTone;

export type EditorCommonProps = {
  file: File;
  meta: LoadedMediaMeta;
  /** Show a toast in the shell. */
  onStatus: (msg: string, tone?: StatusTone) => void;
  onRegisterActions: (actions: EditorToolbarActions) => void;
  /** Open a different file in place of the current one (it goes through detection again). */
  onReplaceFile: (file: File) => void;
  colorMode: "dark" | "light";
  /**
   * The editor's state saved before a reload, as stored. Untrusted: the editor validates it and
   * starts fresh when it does not fit.
   */
  initialState?: unknown;
  /** Extra files saved with that state (pasted pictures), by the editor's id. */
  initialExtraFiles?: ReadonlyMap<string, File>;
  /**
   * Save the editor's state and extra files so a reload restores them, and so the project can be
   * reopened from Home. Editors call it, debounced, whenever committed state or extra files
   * change, and once more when they close with a change still pending.
   */
  onPersistState?: (snapshot: PersistSnapshot) => void;
  /** The file could not be loaded or decoded; the editor shows its own message. */
  onMediaError?: () => void;
};

export type PersistSnapshot = {
  /** The editor's state, as `initialState` will hand it back. */
  readonly state: unknown;
  /** Extra files the state refers to, by the editor's id. */
  readonly extraFiles?: ReadonlyMap<string, File>;
  /**
   * A small picture of the result for the Home page's recent list, as a data URL, or null when
   * none could be made. Leave it out to keep the one already saved.
   */
  readonly thumbnail?: Promise<string | null>;
};
