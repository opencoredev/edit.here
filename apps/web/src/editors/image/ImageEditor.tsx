import {
  applyRedactionStyle,
  bringAnnotationForward,
  canRedo,
  canUndo,
  commitImageState,
  createHistory,
  createImageHistory,
  croppedPixelSize,
  detectMediaKindSync,
  duplicateImageAnnotation,
  enterFrameTool,
  exportFileName,
  exportFormatInfo,
  IMAGE_EXPORT_FORMATS,
  flipGeometryX,
  FULL_RECT,
  applyAnnotationStyle,
  imageCompositionBounds,
  imageLayerCrop,
  imageLayerCropPixels,
  imageLayers,
  isFullRect,
  matchKeybind,
  moveAnnotation,
  nudgeCrop,
  orientedSize,
  parseImageDocumentState,
  placeImageLayer,
  redoImageState,
  removeImageAnnotation,
  removeImageRedaction,
  replaceImageAnnotation,
  resetImageTransform,
  rotateGeometryCw,
  selectedAnnotation,
  selectImageTool,
  sendAnnotationBackward,
  setImageLayerCrop,
  sourceRectToView,
  undoImageState,
  updateImageFrame,
  updateRedaction,
  viewRectToSource,
  type AnnotationStyle,
  type FileLike,
  type FrameConfig,
  type ImageDocumentState,
  type ImageGeometry,
  type ImageHistory,
  type ImageLayer,
  type ImageTool,
  type RedactionStyle,
} from "@edit-here/core";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../../components/Icon";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { randomId } from "../../lib/new-id";
import { detectPlatform, isEditableTarget } from "../../lib/platform";
import { usePersist } from "../../lib/use-persist";
import type { EditorCommonProps } from "../types";
import { aspectFits, turnAspect, type AspectPreset } from "./aspect";
import { CropStage } from "./CropStage";
import { EditorFrame } from "../../components/EditorFrame";
import { AnnotationOverlay } from "./AnnotationOverlay";
import {
  hasImageOptions,
  ImageOptions,
  ImageToolBar,
  imageOptionsLabel,
  type CropTargetOption,
} from "./ImageDock";
import { PreviewStage } from "./PreviewStage";
import { RedactionOverlay } from "./RedactionOverlay";
import { exportImageBlob, renderThumbnailCanvas, type LayerSources } from "./render";
import { encodeThumbnail, THUMBNAIL_EDGE } from "../../lib/thumbnail";
import type { StageViewportController } from "./use-stage-viewport";
import {
  closeDecodedImage,
  decodeImage,
  useImageSource,
  type DecodedImage,
} from "./use-image-source";

export function ImageEditor(props: EditorCommonProps) {
  const source = useImageSource(props.file);
  const { onRegisterActions, onMediaError } = props;

  useEffect(() => {
    if (source.kind !== "ready") onRegisterActions({ busy: source.kind === "loading" });
  }, [source.kind, onRegisterActions]);

  useEffect(() => {
    if (source.kind === "error") onMediaError?.();
  }, [source.kind, onMediaError]);

  switch (source.kind) {
    case "loading":
      return (
        <div
          className="flex flex-1 items-center justify-center text-sm text-ink-muted"
          role="status"
        >
          Decoding image…
        </div>
      );
    case "error":
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <p role="alert" className="flex items-center gap-2 text-sm text-ink">
            <Icon icon={AlertCircleIcon} className="size-4 shrink-0 text-danger" />
            {source.message}
          </p>
        </div>
      );
    case "ready":
      return <ImageWorkspace {...props} image={source.image} />;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type Direction = { readonly dx: number; readonly dy: number };

function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a[href], input, select, textarea, [role="slider"], [role="switch"]') !==
      null
  );
}

/** True when the active tool shows a selection that Delete and Escape act on. */
function hasSelection(s: ImageDocumentState): boolean {
  return s.tool === "redact" ? s.selectedRedactionId !== null : selectedAnnotation(s) !== null;
}

/** Files the canvas takes as image layers. */
function isImageFile(file: FileLike): boolean {
  return detectMediaKindSync(file) === "image";
}

/** What the crop tool works on: the base image, or one picture on the canvas. */
type CropTarget = { readonly kind: "base" } | { readonly kind: "layer"; readonly id: string };

const BASE_TARGET: CropTarget = { kind: "base" };
/** The crop target selector's value for the base image (layer ids are UUIDs). */
const BASE_TARGET_VALUE = "base";

function sameTarget(a: CropTarget, b: CropTarget): boolean {
  return a.kind === "base" ? b.kind === "base" : b.kind === "layer" && a.id === b.id;
}

/** The image layer `target` names in `state`, or null for the base or a layer that is gone. */
function targetLayer(target: CropTarget, state: ImageDocumentState): ImageLayer | null {
  if (target.kind === "base") return null;
  return imageLayers(state.annotations).find((layer) => layer.id === target.id) ?? null;
}

/** How far a duplicate lands from its original, in view space. */
const DUPLICATE_OFFSET = { x: 0.03, y: 0.03 } as const;

/** A picture on the canvas: its file (kept for saving) and decoded bitmaps. */
type LayerAsset = { readonly file: File; readonly image: DecodedImage };

/**
 * Decoded pictures for image layers, by asset id. Assets stay while the editor is open, so undo
 * can bring back a deleted layer; their bitmaps are freed when it closes.
 */
function useLayerAssets(
  initial: ReadonlyMap<string, File> | undefined,
  onError: (message: string) => void,
) {
  const [assets, setAssets] = useState<ReadonlyMap<string, LayerAsset>>(() => new Map());
  const owned = useRef(new Map<string, LayerAsset>());
  const alive = useRef(true);

  const add = useCallback(async (id: string, file: File): Promise<LayerAsset | null> => {
    try {
      const image = await decodeImage(file);
      if (!alive.current) {
        closeDecodedImage(image);
        return null;
      }
      const asset = { file, image };
      owned.current.set(id, asset);
      setAssets(new Map(owned.current));
      return asset;
    } catch {
      return null;
    }
  }, []);

  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  });
  const initialRef = useRef(initial);
  useEffect(() => {
    alive.current = true;
    const assetsOwned = owned.current;
    const restore = initialRef.current;
    if (restore !== undefined) {
      for (const [id, file] of restore) {
        void add(id, file).then((asset) => {
          if (asset === null && alive.current)
            onErrorRef.current(`Could not restore ${file.name}.`);
        });
      }
    }
    return () => {
      alive.current = false;
      for (const asset of assetsOwned.values()) closeDecodedImage(asset.image);
      assetsOwned.clear();
    };
  }, [add]);

  return { assets, add };
}

const ARROWS: Readonly<Record<string, Direction>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

function ImageWorkspace({
  file,
  image,
  onStatus,
  onRegisterActions,
  initialState,
  initialExtraFiles,
  onPersistState,
}: EditorCommonProps & { image: DecodedImage }) {
  const [platform] = useState(detectPlatform);
  const [history, setHistory] = useState<ImageHistory>(() => {
    const restored =
      initialState === undefined
        ? null
        : parseImageDocumentState(initialState, new Set(initialExtraFiles?.keys() ?? []));
    return restored === null ? createImageHistory(image.size) : createHistory(restored);
  });
  const [draft, setDraft] = useState<ImageDocumentState | null>(null);
  // True while a drag on the canvas is drafting; the stage then holds its scale steady.
  const [canvasDrag, setCanvasDrag] = useState(false);
  const [liveCrop, setLiveCrop] = useState<ImageGeometry | null>(null);
  const [aspect, setAspect] = useState<AspectPreset>("free");
  const [cropTarget, setCropTarget] = useState<CropTarget>(BASE_TARGET);
  const cropTargetRef = useRef(cropTarget);
  useLayoutEffect(() => {
    cropTargetRef.current = cropTarget;
  });
  const frameVisited = useRef(history.present.frame.enabled);
  const stageRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<StageViewportController | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const reportError = useCallback((message: string) => onStatus(message, "error"), [onStatus]);
  const { assets, add: addAsset } = useLayerAssets(initialExtraFiles, reportError);

  const present = history.present;
  const shown = draft ?? present;

  const update = useCallback(
    (fn: (state: ImageDocumentState) => ImageDocumentState) =>
      setHistory((h) => commitImageState(h, fn(h.present))),
    [],
  );

  // Undo and redo read the latest history through this ref; so does entering the crop tool.
  const historyRef = useRef(history);
  useLayoutEffect(() => {
    historyRef.current = history;
  });

  /** Crops `next` from now on. A new target starts with a free aspect, so zriz doesn't refit it. */
  const chooseCropTarget = useCallback((next: CropTarget) => {
    if (sameTarget(next, cropTargetRef.current)) return;
    cropTargetRef.current = next;
    setCropTarget(next);
    setLiveCrop(null);
    setAspect("free");
  }, []);

  // --- commands ---------------------------------------------------------------------------
  const setTool = useCallback(
    (tool: ImageTool) => {
      setDraft(null);
      const before = historyRef.current.present;
      if (tool === "crop" && before.tool !== "crop") {
        // Crop what is selected: a picture on the canvas, or else the base image.
        const selected = selectedAnnotation(before);
        chooseCropTarget(
          selected?.kind === "image" ? { kind: "layer", id: selected.id } : BASE_TARGET,
        );
      }
      if (tool === "frame") {
        const first = !frameVisited.current;
        frameVisited.current = true;
        update((s) => enterFrameTool(selectImageTool(s, "frame"), first));
        return;
      }
      update((s) => selectImageTool(s, tool));
    },
    [update, chooseCropTarget],
  );

  const rotate = useCallback(() => {
    update(rotateGeometryCw);
    setAspect(turnAspect);
  }, [update]);
  const flip = useCallback(() => update(flipGeometryX), [update]);
  const reset = useCallback(() => {
    update(resetImageTransform);
    setAspect("free");
  }, [update]);
  const toggleTransparent = useCallback(
    () => update((s) => ({ ...s, transparent: !s.transparent })),
    [update],
  );
  /** Deletes the selected drawing or picture in select mode, or the selected box in redact. */
  const deleteSelected = useCallback(() => {
    update((s) => {
      if (s.tool === "redact") {
        return s.selectedRedactionId === null ? s : removeImageRedaction(s, s.selectedRedactionId);
      }
      const selected = selectedAnnotation(s);
      return selected === null ? s : removeImageAnnotation(s, selected.id);
    });
  }, [update]);
  /** Applies `op` to the selected drawing or picture, if one is on screen. */
  const withSelected = useCallback(
    (op: (s: ImageDocumentState, id: string) => ImageDocumentState) =>
      update((s) => {
        const selected = selectedAnnotation(s);
        return selected === null ? s : op(s, selected.id);
      }),
    [update],
  );
  const duplicateSelected = useCallback(
    () =>
      withSelected((s, id) =>
        duplicateImageAnnotation({ state: s, id, newId: randomId(), offset: DUPLICATE_OFFSET }),
      ),
    [withSelected],
  );
  const bringForward = useCallback(() => withSelected(bringAnnotationForward), [withSelected]);
  const sendBackward = useCallback(() => withSelected(sendAnnotationBackward), [withSelected]);
  const selectAnnotation = useCallback(
    (id: string | null) => update((s) => ({ ...s, selectedAnnotationId: id })),
    [update],
  );
  const selectRedaction = useCallback(
    (id: string | null) => update((s) => ({ ...s, selectedRedactionId: id })),
    [update],
  );

  const nudge = useCallback(
    (direction: Direction, step: number) => {
      update((s) => {
        if (s.tool === "crop") {
          const layer = targetLayer(cropTargetRef.current, s);
          if (layer !== null) {
            return setImageLayerCrop({
              state: s,
              id: layer.id,
              crop: nudgeCrop({
                crop: imageLayerCrop(layer),
                oriented: { width: layer.naturalWidth, height: layer.naturalHeight },
                dxPixels: direction.dx * step,
                dyPixels: direction.dy * step,
              }),
            });
          }
          return {
            ...s,
            crop: nudgeCrop({
              crop: s.crop,
              oriented: orientedSize(image.size, s.rotation),
              dxPixels: direction.dx * step,
              dyPixels: direction.dy * step,
            }),
          };
        }
        const pixels = croppedPixelSize(image.size, s);
        const annotation = s.annotations.find((a) => a.id === s.selectedAnnotationId);
        if (s.tool === "select" && annotation !== undefined) {
          return replaceImageAnnotation(
            s,
            moveAnnotation({
              annotation,
              dx: (direction.dx * step) / pixels.width,
              dy: (direction.dy * step) / pixels.height,
              geometry: s,
            }),
          );
        }
        const selected = s.redactions.find((r) => r.id === s.selectedRedactionId);
        if (s.tool !== "redact" || selected === undefined) return s;
        const view = sourceRectToView(selected.rect, s);
        const moved = {
          ...view,
          x: view.x + (direction.dx * step) / pixels.width,
          y: view.y + (direction.dy * step) / pixels.height,
        };
        return {
          ...s,
          redactions: updateRedaction(s.redactions, selected.id, {
            rect: viewRectToSource(moved, s),
          }),
        };
      });
    },
    [image.size, update],
  );

  // Undo and redo can restore a crop that no longer fits the chosen aspect preset (say, from
  // before a rotate); drop the preset then so zriz doesn't refit the restored crop.
  const travel = useCallback(
    (step: (h: ImageHistory) => ImageHistory) => {
      setDraft(null);
      const next = step(historyRef.current);
      historyRef.current = next;
      setHistory(next);
      const size = croppedPixelSize(image.size, next.present);
      setAspect((current) => (aspectFits(current, size) ? current : "free"));
    },
    [image.size],
  );
  const undo = useCallback(() => travel(undoImageState), [travel]);
  const redo = useCallback(() => travel(redoImageState), [travel]);

  // --- pictures on the canvas ---------------------------------------------------------------
  const appendFiles = useCallback(
    async (files: readonly File[]) => {
      const pictures = files.filter(isImageFile);
      if (pictures.length < files.length) {
        onStatus("Only images can be added to the canvas.", "error");
      }
      let added = 0;
      // One at a time, so each lands after the one before it.
      for (const picture of pictures) {
        const assetId = randomId();
        const asset = await addAsset(assetId, picture);
        if (asset === null) {
          onStatus(`Could not read ${picture.name}.`, "error");
          continue;
        }
        setDraft(null);
        update((s) =>
          placeImageLayer({
            state: s,
            source: image.size,
            natural: asset.image.size,
            id: randomId(),
            assetId,
          }),
        );
        added += 1;
      }
      if (added > 0) {
        // Show the whole composition, including what was just placed beside the image.
        viewportRef.current?.fit();
        onStatus(
          added === 1 ? "Added image to canvas" : `Added ${added} images to canvas`,
          "success",
        );
      }
    },
    [addAsset, image.size, onStatus, update],
  );
  const chooseImages = useCallback(() => pickerRef.current?.click(), []);

  const previewLayers: LayerSources = useMemo(
    () => new Map([...assets].map(([id, asset]) => [id, asset.image.preview])),
    [assets],
  );
  const fullLayers: LayerSources = useMemo(
    () => new Map([...assets].map(([id, asset]) => [id, asset.image.full])),
    [assets],
  );

  // --- persistence ----------------------------------------------------------------------------
  /**
   * A thumbnail of `state` as it would export, for Home's recent list. Drawn right away, while
   * the bitmaps are open; when they are already closed (the editor is closing) there is none and
   * the saved one stays.
   */
  const thumbnailOf = useCallback(
    (state: ImageDocumentState): Promise<string | null> | undefined => {
      try {
        const canvas = renderThumbnailCanvas({
          source: image.preview,
          sourceSize: image.size,
          state,
          layers: previewLayers,
          edge: THUMBNAIL_EDGE,
        });
        return Promise.resolve(encodeThumbnail(canvas, canvas.width, canvas.height));
      } catch {
        return undefined;
      }
    },
    [image, previewLayers],
  );

  // The saved files are the pictures the document uses now; undo history is not saved.
  const persisted = useMemo(() => {
    const files = new Map<string, File>();
    for (const layer of imageLayers(present.annotations)) {
      const asset = assets.get(layer.assetId);
      if (asset !== undefined) files.set(layer.assetId, asset.file);
    }
    return { state: present, files };
  }, [present, assets]);
  usePersist(
    persisted,
    onPersistState === undefined
      ? undefined
      : (value) => {
          const thumbnail = thumbnailOf(value.state);
          onPersistState({
            state: value.state,
            extraFiles: value.files,
            ...(thumbnail === undefined ? {} : { thumbnail }),
          });
        },
  );

  // --- export and copy ----------------------------------------------------------------------
  const presentRef = useRef(present);
  useLayoutEffect(() => {
    presentRef.current = present;
  });

  const exportFile = useCallback(
    async (requested?: string) => {
      const state = presentRef.current;
      // A format picked from the menu exports now, before the state's own format catches up.
      const format =
        IMAGE_EXPORT_FORMATS.find((f) => f.format === requested)?.format ?? state.exportFormat;
      const blob = await exportImageBlob({
        source: image.full,
        sourceSize: image.size,
        state,
        layers: fullLayers,
        format,
      });
      downloadBlob(blob, exportFileName(file.name, format));
    },
    [file.name, image, fullLayers],
  );

  /** Copies the result as a PNG; settles when the clipboard took it (the header then says so). */
  const copy = useCallback((): Promise<void> => {
    if (typeof ClipboardItem === "undefined" || navigator.clipboard?.write === undefined) {
      onStatus("This browser can't copy images. Export instead.", "error");
      return Promise.reject(new Error("Clipboard images are not supported."));
    }
    // Hand the clipboard a promise right away so Safari keeps the user gesture.
    const png = exportImageBlob({
      source: image.full,
      sourceSize: image.size,
      state: presentRef.current,
      layers: fullLayers,
      format: "image/png",
    });
    return navigator.clipboard
      .write([new ClipboardItem({ "image/png": png })])
      .catch((cause: unknown) => {
        onStatus(
          cause instanceof Error && cause.message !== ""
            ? `Copy failed: ${cause.message}`
            : "Copy failed.",
          "error",
        );
        throw cause;
      });
  }, [image, fullLayers, onStatus]);

  const formatLabel = exportFormatInfo(present.exportFormat).label;
  const undoable = canUndo(history);
  const redoable = canRedo(history);
  const exportFormat = present.exportFormat;
  const exportFormats = useMemo(
    () => ({
      options: IMAGE_EXPORT_FORMATS.map((f) => ({ id: f.format, label: f.label })),
      selected: exportFormat,
      onSelect: (id: string) => {
        const format = IMAGE_EXPORT_FORMATS.find((f) => f.format === id)?.format;
        if (format !== undefined) update((s) => ({ ...s, exportFormat: format }));
      },
    }),
    [exportFormat, update],
  );
  useEffect(() => {
    onRegisterActions({
      primaryAction: "copy",
      copy,
      exportFile,
      undo,
      redo,
      canUndo: undoable,
      canRedo: redoable,
      exportLabel: `Export ${formatLabel}`,
      exportFormats,
      copyLabel: "Copy image",
      appendFiles: (files) => void appendFiles(files),
      canAppend: isImageFile,
      appendLabel: "Add to canvas",
      appendDetail: "Place it next to this image",
    });
  }, [
    appendFiles,
    copy,
    exportFile,
    undo,
    redo,
    undoable,
    redoable,
    formatLabel,
    exportFormats,
    onRegisterActions,
  ]);

  // --- keyboard -----------------------------------------------------------------------------
  // Enter finishes the crop; `finishCrop` is defined with the crop target below.
  const finishCropRef = useRef<() => void>(() => undefined);
  const keyHandlers = useRef({
    setTool,
    rotate,
    flip,
    reset,
    toggleTransparent,
    deleteSelected,
    duplicateSelected,
    bringForward,
    sendBackward,
    nudge,
    selectRedaction,
    selectAnnotation,
    present,
  });
  useLayoutEffect(() => {
    keyHandlers.current = {
      setTool,
      rotate,
      flip,
      reset,
      toggleTransparent,
      deleteSelected,
      duplicateSelected,
      bringForward,
      sendBackward,
      nudge,
      selectRedaction,
      selectAnnotation,
      present,
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || isEditableTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[role="dialog"]') !== null)
        return;
      const h = keyHandlers.current;
      // `image.nudge` in the catalog; Shift takes 10px steps, so arrows are matched here.
      const direction = ARROWS[event.key];
      if (direction !== undefined) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        // Arrows belong to focused controls (sliders, toggle groups, zriz's crop area);
        // nudge only when focus is on the page or the stage itself.
        const target = event.target;
        const onStage =
          target === document.body ||
          (target instanceof HTMLElement &&
            stageRef.current?.contains(target) === true &&
            target.closest("[data-zriz-item]") === null);
        if (!onStage) return;
        event.preventDefault();
        h.nudge(direction, event.shiftKey ? 10 : 1);
        return;
      }
      const action = matchKeybind(event, "image");
      switch (action) {
        case "image.select":
          event.preventDefault();
          h.setTool("select");
          return;
        case "image.pen":
          event.preventDefault();
          h.setTool("pen");
          return;
        case "image.highlighter":
          event.preventDefault();
          h.setTool("highlighter");
          return;
        case "image.arrow":
          event.preventDefault();
          h.setTool("arrow");
          return;
        case "image.rectangle":
          event.preventDefault();
          h.setTool("rectangle");
          return;
        case "image.text":
          event.preventDefault();
          h.setTool("text");
          return;
        case "image.crop":
          event.preventDefault();
          h.setTool("crop");
          return;
        case "image.done":
          // Enter finishes the crop; elsewhere it still presses a focused button.
          if (h.present.tool !== "crop" || isControl(event.target)) return;
          event.preventDefault();
          finishCropRef.current();
          return;
        case "image.redact":
          event.preventDefault();
          h.setTool("redact");
          return;
        case "image.frame":
          event.preventDefault();
          h.setTool("frame");
          return;
        case "image.transparent":
          event.preventDefault();
          h.toggleTransparent();
          return;
        case "image.rotate":
          event.preventDefault();
          h.rotate();
          return;
        case "image.flip":
          event.preventDefault();
          h.flip();
          return;
        case "image.reset":
          event.preventDefault();
          h.reset();
          return;
        case "image.zoomIn":
          event.preventDefault();
          viewportRef.current?.zoomIn();
          return;
        case "image.zoomOut":
          event.preventDefault();
          viewportRef.current?.zoomOut();
          return;
        case "image.zoomReset":
          event.preventDefault();
          viewportRef.current?.fit();
          return;
        case "image.zoomActual":
          event.preventDefault();
          viewportRef.current?.actual();
          return;
        case "image.deleteRedaction":
          if (!hasSelection(h.present)) return;
          event.preventDefault();
          h.deleteSelected();
          return;
        case "image.duplicate":
          if (selectedAnnotation(h.present) === null) return;
          event.preventDefault();
          h.duplicateSelected();
          return;
        case "image.bringForward":
          if (selectedAnnotation(h.present) === null) return;
          event.preventDefault();
          h.bringForward();
          return;
        case "image.sendBackward":
          if (selectedAnnotation(h.present) === null) return;
          event.preventDefault();
          h.sendBackward();
          return;
        case "global.escape":
          // First clear the selection, then leave the tool for select mode.
          if (h.present.tool === "redact" && h.present.selectedRedactionId !== null) {
            h.selectRedaction(null);
          } else if (selectedAnnotation(h.present) !== null) {
            h.selectAnnotation(null);
          } else if (h.present.tool !== "select") {
            h.setTool("select");
          }
          return;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // --- panel callbacks ----------------------------------------------------------------------
  const onRedactionStyle = useCallback(
    (style: RedactionStyle) => update((s) => applyRedactionStyle(s, style)),
    [update],
  );

  const onIntensity = useCallback(
    (intensity: number, phase: "live" | "commit") => {
      const apply = (s: ImageDocumentState): ImageDocumentState =>
        s.selectedRedactionId === null
          ? s
          : {
              ...s,
              redactions: updateRedaction(s.redactions, s.selectedRedactionId, { intensity }),
            };
      if (phase === "live") {
        setDraft(apply(presentRef.current));
        return;
      }
      setDraft(null);
      update(apply);
    },
    [update],
  );

  const onFrame = useCallback(
    (patch: Partial<FrameConfig>, phase: "live" | "commit") => {
      if (phase === "live") {
        setDraft(updateImageFrame(presentRef.current, patch));
        return;
      }
      setDraft(null);
      update((s) => updateImageFrame(s, patch));
    },
    [update],
  );

  const onAnnotationStyle = useCallback(
    (patch: Partial<AnnotationStyle>, phase: "live" | "commit") => {
      // The color picker reports every drag step; only its final value makes an undo step.
      if (phase === "live") {
        setDraft(applyAnnotationStyle(presentRef.current, patch));
        return;
      }
      setDraft(null);
      update((s) => applyAnnotationStyle(s, patch));
    },
    [update],
  );

  const onLayerRadius = useCallback(
    (radius: number, phase: "live" | "commit") => {
      const apply = (s: ImageDocumentState): ImageDocumentState => {
        const selected = selectedAnnotation(s);
        return selected?.kind === "image" ? replaceImageAnnotation(s, { ...selected, radius }) : s;
      };
      if (phase === "live") {
        setDraft(apply(presentRef.current));
        return;
      }
      setDraft(null);
      update(apply);
    },
    [update],
  );

  const onCanvasDraft = useCallback((next: ImageDocumentState | null) => {
    setDraft(next);
    setCanvasDrag(next !== null);
  }, []);

  // --- crop target ----------------------------------------------------------------------------
  // The picture being cropped, while it is still on the canvas and decoded; else the base.
  const cropLayer = useMemo(() => {
    const layer = targetLayer(cropTarget, present);
    const asset = layer === null ? undefined : assets.get(layer.assetId);
    return layer !== null && asset !== undefined ? { layer, file: asset.file } : null;
  }, [cropTarget, present, assets]);
  const cropLayerId = cropLayer?.layer.id ?? null;

  const onCropCommit = useCallback(
    (geometry: ImageGeometry) =>
      update((s) =>
        cropLayerId === null
          ? { ...s, ...geometry }
          : setImageLayerCrop({ state: s, id: cropLayerId, crop: geometry.crop }),
      ),
    [update, cropLayerId],
  );

  const resetCrop = useCallback(() => {
    setAspect("free");
    update((s) =>
      cropLayerId === null
        ? { ...s, crop: FULL_RECT }
        : setImageLayerCrop({ state: s, id: cropLayerId, crop: FULL_RECT }),
    );
  }, [update, cropLayerId]);

  const finishCrop = useCallback(() => {
    setDraft(null);
    // Back to select with the cropped picture selected, ready to move.
    update((s) => {
      const next = selectImageTool(s, "select");
      return cropLayerId === null ? next : { ...next, selectedAnnotationId: cropLayerId };
    });
  }, [update, cropLayerId]);

  useLayoutEffect(() => {
    finishCropRef.current = finishCrop;
  });

  const layerCrop = cropLayer === null ? null : imageLayerCrop(cropLayer.layer);
  const { crop, rotation, flipX } = present;
  const cropGeometry = useMemo(
    () =>
      layerCrop === null
        ? { crop, rotation, flipX }
        : // A picture crops in its own orientation; the canvas turn applies after.
          { crop: layerCrop, rotation: 0 as const, flipX: false },
    [crop, rotation, flipX, layerCrop],
  );
  const cropSize =
    cropLayer === null
      ? croppedPixelSize(image.size, liveCrop ?? shown)
      : imageLayerCropPixels(cropLayer.layer, liveCrop?.crop);
  const cropResettable =
    cropLayer === null ? !isFullRect(present.crop) : !isFullRect(imageLayerCrop(cropLayer.layer));

  const shownAnnotations = shown.annotations;
  const cropTargets: readonly CropTargetOption[] = useMemo(
    () => [
      { value: BASE_TARGET_VALUE, label: "Base" },
      ...imageLayers(shownAnnotations).map((layer, index) => ({
        value: layer.id,
        label: `Image ${index + 2}`,
      })),
    ],
    [shownAnnotations],
  );
  const onCropTarget = useCallback(
    (value: string) =>
      chooseCropTarget(value === BASE_TARGET_VALUE ? BASE_TARGET : { kind: "layer", id: value }),
    [chooseCropTarget],
  );

  const dockProps = {
    state: shown,
    platform,
    sourceSize: image.size,
    cropSize,
    aspect,
    onAspect: setAspect,
    onTool: setTool,
    onRotate: rotate,
    onFlip: flip,
    onReset: reset,
    onFinishCrop: finishCrop,
    onRedactionStyle,
    onIntensity,
    onDeleteSelected: deleteSelected,
    onDuplicateSelected: duplicateSelected,
    onBringForward: bringForward,
    onSendBackward: sendBackward,
    onLayerRadius,
    onAddImage: chooseImages,
    onAnnotationStyle,
    onFrame,
    onTransparent: (transparent: boolean) => update((s) => ({ ...s, transparent })),
    cropTargets,
    cropTarget: cropLayerId ?? BASE_TARGET_VALUE,
    onCropTarget,
    onResetCrop: resetCrop,
    cropResettable,
  };

  const overlay = (() => {
    switch (shown.tool) {
      case "redact":
        return (
          <RedactionOverlay
            base={present}
            shown={shown}
            onDraft={setDraft}
            onCommit={(next) => update(() => next)}
            onSelect={selectRedaction}
          />
        );
      case "select":
      case "pen":
      case "highlighter":
      case "arrow":
      case "rectangle":
      case "text":
        return (
          <AnnotationOverlay
            tool={shown.tool}
            source={image.size}
            base={present}
            shown={shown}
            bounds={imageCompositionBounds(shown.annotations, shown)}
            onDraft={onCanvasDraft}
            onCommit={(next) => update(() => next)}
            onSelect={selectAnnotation}
            onEmptyPress={(event) => viewportRef.current?.panFromPress(event) ?? false}
          />
        );
      case "crop":
      case "frame":
        return undefined;
      default: {
        const _exhaustive: never = shown.tool;
        return _exhaustive;
      }
    }
  })();

  return (
    <EditorFrame
      bar={<ImageToolBar {...dockProps} />}
      tray={hasImageOptions(shown) ? <ImageOptions {...dockProps} /> : null}
      trayLabel={imageOptionsLabel(shown.tool)}
    >
      <section
        ref={stageRef}
        aria-label="Image"
        className={[
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          // The preview reaches under the floating controls (its dot grid fills the window) and
          // pads its own content; the cropper keeps clear of them here.
          shown.tool === "crop" ? "pt-[var(--dock-top)] pb-[var(--dock-bottom)]" : "",
        ].join(" ")}
      >
        {shown.tool === "crop" ? (
          <CropStage
            // zriz reads its image and value once; each target gets its own cropper.
            key={cropLayerId ?? BASE_TARGET_VALUE}
            file={cropLayer?.file ?? file}
            geometry={cropGeometry}
            aspect={aspect}
            onCommit={onCropCommit}
            onLive={setLiveCrop}
            onError={(message) => onStatus(message, "error")}
          />
        ) : (
          <PreviewStage
            image={image}
            state={shown}
            layers={previewLayers}
            fitState={canvasDrag ? present : null}
            label={`Edited ${file.name}`}
            overlay={overlay}
            platform={platform}
            controllerRef={viewportRef}
          />
        )}
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const picked = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            if (picked.length > 0) void appendFiles(picked);
          }}
        />
      </section>
    </EditorFrame>
  );
}
