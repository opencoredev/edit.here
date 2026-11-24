import {
  addImageRedaction,
  createRedaction,
  dragRect,
  isUsableDraw,
  RECT_HANDLES,
  rectFromPoints,
  sourceRectToView,
  updateRedaction,
  viewRectToSource,
  type ImageDocumentState,
  type NormalizedRect,
  type RectHandle,
} from "@edit-here/core";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { randomId } from "../../lib/new-id";

type Point = { readonly x: number; readonly y: number };

type Gesture =
  | {
      readonly kind: "draw";
      readonly pointerId: number;
      readonly id: string;
      readonly start: Point;
      readonly base: ImageDocumentState;
    }
  | {
      readonly kind: "edit";
      readonly pointerId: number;
      readonly id: string;
      readonly handle: RectHandle;
      readonly start: Point;
      readonly startRect: NormalizedRect;
      readonly base: ImageDocumentState;
    };

type RedactionOverlayProps = {
  /** The committed state; gestures start from it. */
  base: ImageDocumentState;
  /** What is on screen (the draft while dragging). */
  shown: ImageDocumentState;
  onDraft: (draft: ImageDocumentState | null) => void;
  onCommit: (next: ImageDocumentState) => void;
  onSelect: (id: string | null) => void;
};

const HANDLE_POSITION: Record<Exclude<RectHandle, "move">, { left: string; top: string }> = {
  nw: { left: "0%", top: "0%" },
  n: { left: "50%", top: "0%" },
  ne: { left: "100%", top: "0%" },
  e: { left: "100%", top: "50%" },
  se: { left: "100%", top: "100%" },
  s: { left: "50%", top: "100%" },
  sw: { left: "0%", top: "100%" },
  w: { left: "0%", top: "50%" },
};

const HANDLE_CURSOR: Record<Exclude<RectHandle, "move">, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

/** Keeps handles and outlines the same size on screen at any stage zoom. */
const UNZOOM = "calc(1 / var(--stage-zoom, 1))";
const outlinePx = (px: number): string => `calc(${px}px / var(--stage-zoom, 1))`;

function pct(value: number): string {
  return `${value * 100}%`;
}

/**
 * Draw, select, move and resize redaction boxes over the preview. Coordinates are view space
 * (0..1 over the cropped image) on screen and source space in the document.
 */
export function RedactionOverlay({
  base,
  shown,
  onDraft,
  onCommit,
  onSelect,
}: RedactionOverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<ImageDocumentState | null>(null);

  const toView = (event: { clientX: number; clientY: number }): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const setDraft = (draft: ImageDocumentState | null) => {
    draftRef.current = draft;
    onDraft(draft);
  };

  const begin = (event: ReactPointerEvent<HTMLElement>, gesture: Gesture) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    surfaceRef.current?.setPointerCapture(event.pointerId);
    gestureRef.current = gesture;
    draftRef.current = null;
  };

  const onSurfaceDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    begin(event, {
      kind: "draw",
      pointerId: event.pointerId,
      id: randomId(),
      start: toView(event),
      base,
    });
  };

  const onBoxDown = (
    event: ReactPointerEvent<HTMLElement>,
    id: string,
    handle: RectHandle,
    viewRect: NormalizedRect,
  ) => {
    onSelect(id);
    begin(event, {
      kind: "edit",
      pointerId: event.pointerId,
      id,
      handle,
      start: toView(event),
      startRect: viewRect,
      base: { ...base, selectedRedactionId: id },
    });
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const point = toView(event);
    const { base: from } = gesture;
    if (gesture.kind === "draw") {
      const view = rectFromPoints(gesture.start, point);
      const rect = viewRectToSource(view, from);
      setDraft(
        addImageRedaction(
          from,
          createRedaction({ id: gesture.id, rect, style: from.redactionStyle }),
        ),
      );
      return;
    }
    const view = dragRect({
      rect: gesture.startRect,
      handle: gesture.handle,
      dx: point.x - gesture.start.x,
      dy: point.y - gesture.start.y,
    });
    setDraft({
      ...from,
      redactions: updateRedaction(from.redactions, gesture.id, {
        rect: viewRectToSource(view, from),
      }),
    });
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const draft = draftRef.current;
    draftRef.current = null;
    onDraft(null);
    if (draft === null) {
      // A click without a drag: on empty space it clears the selection.
      if (gesture.kind === "draw") onSelect(null);
      return;
    }
    if (gesture.kind === "draw") {
      const surface = surfaceRef.current?.getBoundingClientRect();
      const view = rectFromPoints(gesture.start, toView(event));
      const usable = isUsableDraw({
        rect: view,
        viewWidth: surface?.width ?? 0,
        viewHeight: surface?.height ?? 0,
      });
      if (!usable) {
        onSelect(null);
        return;
      }
    }
    onCommit(draft);
  };

  const onCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setDraft(null);
  };

  return (
    <div
      ref={surfaceRef}
      className="absolute inset-0 cursor-crosshair touch-none overflow-hidden select-none"
      onPointerDown={onSurfaceDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
      aria-label="Redaction area. Drag to cover a region."
      role="application"
    >
      {shown.redactions.map((redaction, index) => {
        const view = sourceRectToView(redaction.rect, shown);
        const selected = redaction.id === shown.selectedRedactionId;
        return (
          <div
            key={redaction.id}
            role="button"
            tabIndex={-1}
            aria-label={`Redaction ${index + 1}, ${redaction.style}${selected ? ", selected" : ""}`}
            aria-pressed={selected}
            className={`absolute cursor-move ${
              selected
                ? "outline-2 outline-brand"
                : "outline-1 outline-dashed outline-n10/70 hover:outline-brand"
            }`}
            style={{
              left: pct(view.x),
              top: pct(view.y),
              width: pct(view.width),
              height: pct(view.height),
              outlineWidth: outlinePx(selected ? 2 : 1),
            }}
            onPointerDown={(event) => onBoxDown(event, redaction.id, "move", view)}
          >
            {selected
              ? RECT_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    aria-hidden="true"
                    className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    style={{
                      ...HANDLE_POSITION[handle],
                      cursor: HANDLE_CURSOR[handle],
                      scale: UNZOOM,
                    }}
                    onPointerDown={(event) => onBoxDown(event, redaction.id, handle, view)}
                  >
                    <span className="size-2.5 rounded-full bg-canvas shadow-[0_0_0_1.5px_var(--cte-accent)]" />
                  </span>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
