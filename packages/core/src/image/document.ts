/**
 * Undo-aware updates for the image editor. The history holds whole `ImageDocumentState`
 * values, but only document fields (crop, orientation, redactions, drawings, frame,
 * transparency) make an undo step. View fields (tool, selections, current redaction and drawing
 * styles, export format) change the present in place and survive undo and redo.
 */
import {
  canRedo,
  canUndo,
  createHistory,
  createInitialImageState,
  pushHistory,
  redoHistory,
  undoHistory,
  updateRedaction,
} from "../operations";
import type {
  FrameConfig,
  HistoryStack,
  ImageDocumentState,
  ImageRotation,
  RedactionStyle,
} from "../types";
import type { ImageSize } from "./geometry";
import { suggestedFrameSize } from "./layout";

export type ImageHistory = HistoryStack<ImageDocumentState>;

type ViewFields = Pick<
  ImageDocumentState,
  | "tool"
  | "selectedRedactionId"
  | "redactionStyle"
  | "exportFormat"
  | "selectedAnnotationId"
  | "annotationStyle"
>;

function sameFrame(a: FrameConfig, b: FrameConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.preset === b.preset &&
    a.customMode === b.customMode &&
    a.customColor === b.customColor &&
    a.customColorEnd === b.customColorEnd &&
    a.customAngle === b.customAngle &&
    a.padding === b.padding &&
    a.radius === b.radius &&
    a.shadow === b.shadow
  );
}

/** True when two states differ in a field that belongs in undo history. */
export function imageDocumentChanged(a: ImageDocumentState, b: ImageDocumentState): boolean {
  return (
    a.crop.x !== b.crop.x ||
    a.crop.y !== b.crop.y ||
    a.crop.width !== b.crop.width ||
    a.crop.height !== b.crop.height ||
    a.rotation !== b.rotation ||
    a.flipX !== b.flipX ||
    a.redactions !== b.redactions ||
    a.annotations !== b.annotations ||
    a.transparent !== b.transparent ||
    !sameFrame(a.frame, b.frame)
  );
}

/** Initial state for an image: frame padding and radius sized to it. */
export function createImageDocument(source: ImageSize): ImageDocumentState {
  const initial = createInitialImageState();
  return {
    ...initial,
    frame: { ...initial.frame, ...suggestedFrameSize(source) },
  };
}

export function createImageHistory(source: ImageSize): ImageHistory {
  return createHistory(createImageDocument(source));
}

/** Records `next`: an undo step when document fields changed, an in-place update otherwise. */
export function commitImageState(history: ImageHistory, next: ImageDocumentState): ImageHistory {
  if (next === history.present) return history;
  if (!imageDocumentChanged(history.present, next)) return { ...history, present: next };
  return pushHistory(history, next);
}

function carryView(from: ImageDocumentState, to: ImageDocumentState): ImageDocumentState {
  const view: ViewFields = {
    tool: from.tool,
    redactionStyle: from.redactionStyle,
    exportFormat: from.exportFormat,
    selectedRedactionId:
      from.selectedRedactionId !== null &&
      to.redactions.some((r) => r.id === from.selectedRedactionId)
        ? from.selectedRedactionId
        : null,
    annotationStyle: from.annotationStyle,
    selectedAnnotationId:
      from.selectedAnnotationId !== null &&
      to.annotations.some((a) => a.id === from.selectedAnnotationId)
        ? from.selectedAnnotationId
        : null,
  };
  return { ...to, ...view };
}

export function undoImageState(history: ImageHistory): ImageHistory {
  if (!canUndo(history)) return history;
  const undone = undoHistory(history);
  return { ...undone, present: carryView(history.present, undone.present) };
}

export function redoImageState(history: ImageHistory): ImageHistory {
  if (!canRedo(history)) return history;
  const redone = redoHistory(history);
  return { ...redone, present: carryView(history.present, redone.present) };
}

/** Sets the style for new boxes and restyles the selected box, if any. */
export function applyRedactionStyle(
  state: ImageDocumentState,
  style: RedactionStyle,
): ImageDocumentState {
  const selected = state.selectedRedactionId;
  return {
    ...state,
    redactionStyle: style,
    redactions:
      selected === null ? state.redactions : updateRedaction(state.redactions, selected, { style }),
  };
}

/**
 * Switches to the frame tool. The first visit turns the frame on, since that is what the tool
 * is for; later visits keep whatever the user chose.
 */
export function enterFrameTool(state: ImageDocumentState, firstVisit: boolean): ImageDocumentState {
  return {
    ...state,
    tool: "frame",
    frame: firstVisit && !state.frame.enabled ? { ...state.frame, enabled: true } : state.frame,
  };
}

export function quarterTurns(rotation: ImageRotation): 0 | 1 | 2 | 3 {
  switch (rotation) {
    case 0:
      return 0;
    case 90:
      return 1;
    case 180:
      return 2;
    case 270:
      return 3;
    default: {
      const _exhaustive: never = rotation;
      return _exhaustive;
    }
  }
}

export function rotationFromQuarterTurns(turns: number): ImageRotation {
  switch (((Math.round(turns) % 4) + 4) % 4) {
    case 1:
      return 90;
    case 2:
      return 180;
    case 3:
      return 270;
    default:
      return 0;
  }
}
