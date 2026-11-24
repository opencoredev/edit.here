import {
  FILE_INPUT_ACCEPT,
  matchKeybind,
  type ColorMode,
  type LoadedMediaMeta,
  type MediaKind,
  type ToastTone,
} from "@edit-here/core";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DropOverlay, type DropIntent } from "./components/DropOverlay";
import { DropzoneHome } from "./components/DropzoneHome";
import { EditorErrorBoundary } from "./components/EditorErrorBoundary";
import { GraphicalProvider, theme, Tooltip } from "./components/graphical/index";
import { KeybindsDialog } from "./components/KeybindsDialog";
import { ShellHeader } from "./components/ShellHeader";
import { ToastBar } from "./components/ToastBar";
import type { EditorCommonProps, EditorToolbarActions, PersistSnapshot } from "./editors/types";
import { detectPlatform, isEditableTarget } from "./lib/platform";
import { useEditorActor } from "./lib/use-editor-actor";
import { randomId } from "./lib/new-id";
import { sourceThumbnail } from "./lib/thumbnail";
import {
  clearActivePointer,
  clearAllWorkspaces,
  deleteWorkspaceById,
  listRecentWorkspaces,
  loadActiveWorkspace,
  loadWorkspaceById,
  saveWorkspace,
  saveWorkspaceThumbnail,
  setActivePointer,
  type RecentWorkspace,
  type RestoredWorkspace,
} from "./lib/workspace-store";

const COLOR_MODE_KEY = "edit-here:color-mode";

/** How long a Copy main button reads "Copied". */
const COPIED_MS = 1500;

function readStoredColorMode(): ColorMode {
  try {
    return localStorage.getItem(COLOR_MODE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

// Sample generators pull in mediabunny, so they load on first use.
const SAMPLE_FACTORIES: Record<MediaKind, () => Promise<File>> = {
  image: () => import("./lib/sample-generators").then((m) => m.createSampleImageFile()),
  video: () => import("./lib/sample-generators").then((m) => m.createSampleVideoFile()),
};

// Each editor is its own chunk so a visitor only downloads the one they open.
const ImageEditor = lazy(() =>
  import("./editors/image/ImageEditor").then((m) => ({ default: m.ImageEditor })),
);
const VideoEditor = lazy(() =>
  import("./editors/video/VideoEditor").then((m) => ({ default: m.VideoEditor })),
);

function EditorLoading() {
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-ink-muted" role="status">
      Loading editor…
    </div>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

function EditorSlot(props: EditorCommonProps) {
  switch (props.meta.kind) {
    case "image":
      return <ImageEditor {...props} />;
    case "video":
      return <VideoEditor {...props} />;
    default: {
      const _exhaustive: never = props.meta.kind;
      return _exhaustive;
    }
  }
}

/** Actions are tagged with the session that registered them so a stale editor can't leak in. */
type RegisteredActions = { readonly sessionId: string; readonly actions: EditorToolbarActions };

/** Saved editor state handed to the session it was saved for. */
type Restore = {
  readonly sessionId: string;
  readonly state: unknown;
  readonly extraFiles: ReadonlyMap<string, File>;
};

/**
 * Startup: `checking` reads the saved workspace, `restoring` reopens it, then `ready`. The home
 * page waits until `ready`, so a reload with work saved goes straight back to the editor.
 */
type Boot = "checking" | "restoring" | "ready";

export function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(readStoredColorMode);
  const [platform] = useState(detectPlatform);
  const { snapshot, send } = useEditorActor();
  const { session, toast, keybindsOpen, error } = snapshot.context;
  const exporting = snapshot.matches("exporting");
  const detecting = snapshot.matches("detecting");

  const [files, setFiles] = useState<ReadonlyMap<string, File>>(() => new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [registered, setRegistered] = useState<RegisteredActions | null>(null);
  const [loadingSample, setLoadingSample] = useState<MediaKind | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [boot, setBoot] = useState<Boot>("checking");
  const [restore, setRestore] = useState<Restore | null>(null);
  const [recents, setRecents] = useState<readonly RecentWorkspace[]>([]);
  const [copied, setCopied] = useState(false);
  /** Files to add to a session once its editor is ready (the rest of a multi-file drop). */
  const pendingAppend = useRef<{
    readonly sessionId: string;
    readonly files: readonly File[];
  } | null>(null);

  const sessionFile = session === null ? undefined : files.get(session.id);
  const actions: EditorToolbarActions = useMemo(
    () => (registered !== null && registered.sessionId === session?.id ? registered.actions : {}),
    [registered, session?.id],
  );

  // --- color mode -------------------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["theme"] = colorMode;
    root.classList.toggle("dark", colorMode === "dark");
    root.classList.toggle("light", colorMode === "light");
    try {
      localStorage.setItem(COLOR_MODE_KEY, colorMode);
    } catch {
      // Storage can be blocked (private mode); the toggle still works for this visit.
    }
  }, [colorMode]);

  const toggleColorMode = useCallback(
    () => setColorMode((mode) => (mode === "dark" ? "light" : "dark")),
    [],
  );

  // --- files --------------------------------------------------------------------------------
  const sessionIdRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    sessionIdRef.current = session?.id;
  });

  const openFile = useCallback(
    (file: File, id: string = randomId()): string => {
      // Keep the open file (it stays mounted while the new one is detected) and the new one.
      setFiles((previous) => {
        const next = new Map<string, File>();
        const openId = sessionIdRef.current;
        const openFileValue = openId === undefined ? undefined : previous.get(openId);
        if (openId !== undefined && openFileValue !== undefined) next.set(openId, openFileValue);
        next.set(id, file);
        return next;
      });
      send({ type: "file.open", id, file });
      return id;
    },
    [send],
  );

  /** Opens the first file; the editor then adds the others it accepts (more pictures). */
  const openFiles = useCallback(
    (list: readonly File[]) => {
      const [first, ...rest] = list;
      if (first === undefined) return;
      const id = openFile(first);
      pendingAppend.current = rest.length === 0 ? null : { sessionId: id, files: rest };
    },
    [openFile],
  );

  const chooseFile = useCallback(() => fileInputRef.current?.click(), []);

  const openSample = useCallback(
    async (kind: MediaKind) => {
      setLoadingSample(kind);
      try {
        openFile(await SAMPLE_FACTORIES[kind]());
      } catch (cause) {
        send({
          type: "toast.show",
          message: errorMessage(cause, "Could not create the sample."),
          tone: "error",
        });
      } finally {
        setLoadingSample(null);
      }
    },
    [openFile, send],
  );

  const handleDroppedFiles = useCallback(
    (dropped: readonly File[], intent: DropIntent) => {
      setDragDepth(0);
      if (dropped.length === 0) return;
      if (intent === "append" && actions.appendFiles !== undefined) {
        actions.appendFiles(dropped);
        return;
      }
      openFiles(dropped);
    },
    [actions, openFiles],
  );

  // --- saved projects -------------------------------------------------------------------------
  /** Reopens a saved project with its edits and extra files. */
  const reopen = useCallback(
    (record: RestoredWorkspace) => {
      pendingAppend.current = null;
      // The store's own File objects: saving them again skips their bytes (workspace-store).
      const extraFiles = new Map(record.extraFiles.map((extra) => [extra.id, extra.blob]));
      setRestore({ sessionId: record.id, state: record.state, extraFiles });
      openFile(record.file, record.id);
      // Projects saved before thumbnails existed get one now.
      if (record.thumbnail === null) {
        saveWorkspaceThumbnail(record.id, sourceThumbnail(record.file, record.meta.kind));
      }
    },
    [openFile],
  );

  useEffect(() => {
    let cancelled = false;
    void loadActiveWorkspace().then((record) => {
      if (cancelled) return;
      if (record === null) {
        setBoot("ready");
        return;
      }
      setBoot("restoring");
      reopen(record);
    });
    return () => {
      cancelled = true;
    };
  }, [reopen]);

  const openRecent = useCallback(
    async (id: string) => {
      const record = await loadWorkspaceById(id);
      if (record === null) {
        send({ type: "toast.show", message: "That project could not be opened.", tone: "error" });
        void listRecentWorkspaces().then(setRecents);
        return;
      }
      void setActivePointer(id);
      reopen(record);
    },
    [reopen, send],
  );

  const deleteRecent = useCallback((id: string) => {
    setRecents((list) => list.filter((entry) => entry.id !== id));
    void deleteWorkspaceById(id).then(() => listRecentWorkspaces().then(setRecents));
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    void clearAllWorkspaces().then(() => listRecentWorkspaces().then(setRecents));
  }, []);

  useEffect(() => {
    if (boot !== "restoring") return;
    if (session !== null) {
      // oxlint-disable-next-line react/set-state-in-effect -- startup ends once the editor opens
      setBoot("ready");
    } else if (error !== null) {
      // The saved file no longer opens; start from the home page next time.
      void clearActivePointer();
      setBoot("ready");
    }
  }, [boot, session, error]);

  // --- editor callbacks -------------------------------------------------------------------
  const onStatus = useCallback(
    (message: string, tone: ToastTone = "info") => send({ type: "toast.show", message, tone }),
    [send],
  );

  const sessionId = session?.id;
  const onRegisterActions = useCallback(
    (next: EditorToolbarActions) => {
      if (sessionId !== undefined) setRegistered({ sessionId, actions: next });
    },
    [sessionId],
  );

  // A newly opened file is saved straight away, with a thumbnail of it, so even an unedited
  // file survives a reload and shows on Home. A restored one is already saved.
  const restoredId = restore?.sessionId;
  const firstSaved = useRef(new Set<string>());
  useEffect(() => {
    if (session === null || sessionFile === undefined || session.id === restoredId) return;
    if (firstSaved.current.has(session.id)) return;
    firstSaved.current.add(session.id);
    void saveWorkspace(
      {
        id: session.id,
        meta: session,
        file: sessionFile,
        fileName: sessionFile.name,
        fileType: sessionFile.type,
        state: null,
        extraFiles: [],
        updatedAt: Date.now(),
        thumbnail: sourceThumbnail(sessionFile, session.kind),
      },
      { activate: true },
    );
  }, [session, sessionFile, restoredId]);

  const onPersistState = useCallback(
    ({ state, extraFiles, thumbnail }: PersistSnapshot) => {
      if (session === null || sessionFile === undefined) return;
      void saveWorkspace(
        {
          id: session.id,
          meta: session,
          file: sessionFile,
          fileName: sessionFile.name,
          fileType: sessionFile.type,
          state,
          extraFiles: [...(extraFiles ?? new Map<string, File>())].map(([id, extra]) => ({
            id,
            name: extra.name,
            type: extra.type,
            blob: extra,
          })),
          updatedAt: Date.now(),
          ...(thumbnail === undefined ? {} : { thumbnail }),
        },
        // The last save of an editor that just closed (Home, another file) still lands in its
        // project, but doesn't make it the one a reload reopens.
        { activate: sessionIdRef.current === session.id },
      );
    },
    [session, sessionFile],
  );

  // The rest of a multi-file drop or paste goes to the new editor once it can take files.
  useEffect(() => {
    const pending = pendingAppend.current;
    if (pending === null || pending.sessionId !== sessionId) return;
    const { appendFiles, canAppend } = actions;
    if (appendFiles === undefined) return;
    pendingAppend.current = null;
    const accepted = canAppend === undefined ? pending.files : pending.files.filter(canAppend);
    if (accepted.length > 0) appendFiles(accepted);
  }, [actions, sessionId]);

  const runExport = useCallback(
    async (format?: string) => {
      const exportFile = actions.exportFile;
      if (exportFile === undefined || actions.busy === true || !snapshot.matches("editing")) return;
      const name = session?.name ?? "file";
      const formatLabel =
        format === undefined
          ? undefined
          : actions.exportFormats?.options.find((option) => option.id === format)?.label;
      const label = formatLabel === undefined ? actions.exportLabel : `Export ${formatLabel}`;
      send(label === undefined ? { type: "export.start" } : { type: "export.start", label });
      try {
        await exportFile(format);
        send({ type: "export.done", message: `Exported ${name}` });
      } catch (cause) {
        send({ type: "export.failed", message: errorMessage(cause, "Export failed.") });
      }
    },
    [actions, send, session?.name, snapshot],
  );

  const runCopy = useCallback(() => {
    const copy = actions.copy;
    if (copy === undefined || actions.busy === true) return;
    const result = copy();
    if (result instanceof Promise) {
      result.then(
        () => setCopied(true),
        // The editor reports its own copy errors.
        () => setCopied(false),
      );
    }
  }, [actions]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const closeFile = useCallback(() => {
    pendingAppend.current = null;
    setCopied(false);
    send({ type: "session.close" });
    // Home stays home after a reload; the project stays in the recent list.
    void clearActivePointer();
  }, [send]);

  // --- global keyboard, paste and drag ------------------------------------------------------
  // Listeners read the latest values through a ref so they subscribe once.
  const latest = useRef({
    actions,
    keybindsOpen,
    kind: session?.kind ?? null,
    runExport,
    runCopy,
  });
  useLayoutEffect(() => {
    latest.current = { actions, keybindsOpen, kind: session?.kind ?? null, runExport, runCopy };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
      const {
        actions: current,
        keybindsOpen: sheetOpen,
        kind,
        runExport: exportNow,
        runCopy: copyNow,
      } = latest.current;
      const action = matchKeybind(event, kind);
      switch (action) {
        case "global.help":
          event.preventDefault();
          send({ type: "keybinds.toggle" });
          return;
        case "global.escape":
          // The dialog closes itself on Escape; editors handle deselection.
          return;
        case "global.undo":
          if (sheetOpen || current.undo === undefined) return;
          event.preventDefault();
          current.undo();
          return;
        case "global.redo":
          if (sheetOpen || current.redo === undefined) return;
          event.preventDefault();
          current.redo();
          return;
        case "global.export":
          if (sheetOpen || current.exportFile === undefined) return;
          event.preventDefault();
          void exportNow();
          return;
        case "global.copy": {
          // Leave normal text copying alone.
          const selection = window.getSelection();
          if (
            sheetOpen ||
            current.copy === undefined ||
            (selection !== null && !selection.isCollapsed)
          )
            return;
          event.preventDefault();
          copyNow();
          return;
        }
        default:
          // Media-scoped actions belong to the open editor, which listens with matchKeybind too.
          return;
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const pasted = Array.from(event.clipboardData?.files ?? []);
      if (pasted.length === 0) return;
      event.preventDefault();
      // Pasting another screenshot into an open image adds it to the canvas. Anything else
      // opens in place of the current file.
      const { appendFiles, canAppend } = latest.current.actions;
      if (appendFiles !== undefined && canAppend !== undefined && pasted.every(canAppend)) {
        appendFiles(pasted);
        return;
      }
      openFiles(pasted);
    };

    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true;
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragDepth((depth) => depth + 1);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      setDragDepth((depth) => Math.max(0, depth - 1));
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDragDepth(0);
      openFiles(Array.from(event.dataTransfer?.files ?? []));
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openFiles, send]);

  const meta: LoadedMediaMeta | null = session;
  const restoring = meta !== null && restore !== null && restore.sessionId === meta.id;
  const showHome = boot === "ready" && (meta === null || sessionFile === undefined);

  // Home lists what is saved each time it shows, after any save the closed editor queued.
  useEffect(() => {
    if (!showHome) return;
    let cancelled = false;
    void listRecentWorkspaces().then((list) => {
      if (!cancelled) setRecents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [showHome]);

  return (
    <GraphicalProvider document={theme} colorMode={colorMode}>
      <Tooltip.Provider delay={350}>
        <div className="app-root" data-state={String(snapshot.value)}>
          <ShellHeader
            meta={meta}
            actions={actions}
            exporting={exporting}
            copied={copied}
            colorMode={colorMode}
            platform={platform}
            onToggleColorMode={toggleColorMode}
            onOpenFile={chooseFile}
            onShowKeybinds={() => send({ type: "keybinds.open" })}
            onCloseFile={closeFile}
            onCopy={runCopy}
            onExport={(format) => void runExport(format)}
          />

          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {meta !== null && sessionFile !== undefined ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <EditorErrorBoundary key={meta.id} onClose={closeFile}>
                  <Suspense fallback={<EditorLoading />}>
                    <EditorSlot
                      file={sessionFile}
                      meta={meta}
                      onStatus={onStatus}
                      onRegisterActions={onRegisterActions}
                      onReplaceFile={openFile}
                      colorMode={colorMode}
                      onPersistState={onPersistState}
                      {...(restoring
                        ? { initialState: restore.state, initialExtraFiles: restore.extraFiles }
                        : {})}
                    />
                  </Suspense>
                </EditorErrorBoundary>
              </div>
            ) : boot !== "ready" ? (
              // Reading the saved workspace takes a moment; an empty canvas avoids flashing home.
              <div className="flex-1" aria-busy="true" />
            ) : (
              <DropzoneHome
                platform={platform}
                opening={detecting}
                dragging={dragDepth > 0}
                loadingSample={loadingSample}
                error={error}
                recents={recents}
                onChooseFile={chooseFile}
                onSample={(kind) => void openSample(kind)}
                onOpenRecent={(id) => void openRecent(id)}
                onDeleteRecent={deleteRecent}
                onClearRecents={clearRecents}
                onDismissError={() => send({ type: "error.dismiss" })}
              />
            )}
          </main>

          <KeybindsDialog
            open={keybindsOpen}
            activeKind={meta?.kind ?? null}
            platform={platform}
            onOpenChange={(open) => send({ type: open ? "keybinds.open" : "keybinds.close" })}
          />
          <ToastBar toast={toast} onDismiss={(id) => send({ type: "toast.dismiss", id })} />
          <DropOverlay
            visible={dragDepth > 0}
            hasSession={meta !== null}
            canAppend={actions.appendFiles !== undefined}
            appendLabel={actions.appendLabel ?? "Add to file"}
            appendDetail={actions.appendDetail ?? "Keep editing this file"}
            onDropFiles={handleDroppedFiles}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            multiple
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const picked = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              openFiles(picked);
            }}
          />
        </div>
      </Tooltip.Provider>
    </GraphicalProvider>
  );
}
