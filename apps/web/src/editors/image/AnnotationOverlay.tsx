import {
  addImageAnnotation,
  annotationAt,
  annotationBounds,
  annotationFontSize,
  annotationHandles,
  annotationToSource,
  imageCompositionBounds,
  isUsableAnnotation,
  moveAnnotation,
  rectFromPoints,
  removeImageAnnotation,
  replaceImageAnnotation,
  resizeAnnotation,
  TEXT_LINE_HEIGHT,
  textAnchorFromTopLeft,
  viewPointToSource,
  viewScale,
  type AnnotationHandle,
  type DrawingTool,
  type HitContext,
  type ImageAnnotation,
  type ImageDocumentState,
  type ImageSize,
  type NormalizedPoint,
} from "@edit-here/core";
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { randomId } from "../../lib/new-id";
import { isTouchPrimary } from "../../lib/platform";
import type { CanvasDraftStore } from "./canvas-draft";
import { measureAnnotationText } from "./render";
import { subscribeTextFonts, textFontSettled } from "./text-fonts";

type Gesture =
  | {
      readonly kind: "stroke";
      readonly pointerId: number;
      readonly id: string;
      readonly tool: "pen" | "highlighter";
      readonly points: NormalizedPoint[];
    }
  | {
      readonly kind: "arrow";
      readonly pointerId: number;
      readonly id: string;
      readonly from: NormalizedPoint;
    }
  | {
      readonly kind: "rectangle";
      readonly pointerId: number;
      readonly id: string;
      readonly from: NormalizedPoint;
    }
  | {
      readonly kind: "move";
      readonly pointerId: number;
      readonly start: NormalizedPoint;
      readonly original: ImageAnnotation;
      readonly base: ImageDocumentState;
    }
  | {
      readonly kind: "resize";
      readonly pointerId: number;
      readonly handle: AnnotationHandle;
      readonly start: NormalizedPoint;
      readonly original: ImageAnnotation;
      readonly base: ImageDocumentState;
    };

type TextAnnotation = Extract<ImageAnnotation, { kind: "text" }>;

/**
 * The text box being typed: a new one at a point, or an existing one being edited. `topLeft` is
 * the upright box's top-left corner in view space, where the textarea sits.
 */
type TextEdit = {
  readonly id: string;
  readonly topLeft: NormalizedPoint;
  readonly value: string;
  readonly existing: TextAnnotation | null;
};

type AnnotationOverlayProps = {
  tool: "select" | DrawingTool;
  source: ImageSize;
  /** The committed state; gestures start from it. */
  base: ImageDocumentState;
  /** What is on screen outside a gesture of this overlay. */
  shown: ImageDocumentState;
  /** Where this overlay's gestures publish their drafts; select mode follows them live. */
  draft: CanvasDraftStore;
  onCommit: (next: ImageDocumentState) => void;
  onSelect: (id: string | null) => void;
  /**
   * A select-mode press that hit no drawing. Returns true when the stage took it (to pan a
   * zoomed image).
   */
  onEmptyPress?: (event: { pointerId: number; clientX: number; clientY: number }) => boolean;
};

const CURSOR: Readonly<Record<AnnotationOverlayProps["tool"], string>> = {
  select: "default",
  pen: "crosshair",
  highlighter: "crosshair",
  arrow: "crosshair",
  rectangle: "crosshair",
  text: "text",
};

/** An outline width or offset that stays the same on screen at any stage zoom. */
const unzoomedPx = (px: number): string => `calc(${px}px / var(--stage-zoom, 1))`;

const noDraft = (): ImageDocumentState | null => null;

function pct(value: number): string {
  return `${value * 100}%`;
}

/**
 * Draws and edits annotations over the preview. Pointer positions are view space (0..1 over the
 * cropped image); the document stores source space.
 */
export function AnnotationOverlay({
  tool,
  source,
  base,
  shown: shownOutside,
  draft,
  onCommit,
  onSelect,
  onEmptyPress,
}: AnnotationOverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<ImageDocumentState | null>(null);
  const [hovering, setHovering] = useState(false);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [surfaceSize, setSurfaceSize] = useState<ImageSize>({ width: 0, height: 0 });
  // Only select mode shows the moving selection; drawing tools never re-render per move.
  const live = useSyncExternalStore(draft.subscribe, tool === "select" ? draft.get : noDraft);
  // Text boxes are measured in the canvas font, so placing or editing one waits for it.
  const textFontReady = useSyncExternalStore(subscribeTextFonts, textFontSettled);
  const shown = live ?? shownOutside;
  // The composition in view space. Presses anywhere on it reach the overlay, so a layer beside
  // the base image can be picked and dragged.
  const bounds = imageCompositionBounds(shown.annotations, shown);

  useLayoutEffect(() => {
    const el = surfaceRef.current;
    if (el === null) return;
    const observer = new ResizeObserver(() =>
      setSurfaceSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = viewScale({ source, geometry: base, viewWidth: surfaceSize.width });

  const context = (state: ImageDocumentState): HitContext => ({
    source,
    geometry: state,
    view: surfaceSize,
    measureText: measureAnnotationText,
  });

  /**
   * The surface's size on screen. It differs from `surfaceSize` (layout pixels) while the stage
   * is zoomed, and thresholds meant for the hand, like hit reach and minimum mark size, use it.
   */
  const screenSize = (): ImageSize => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return rect === undefined ? surfaceSize : { width: rect.width, height: rect.height };
  };

  /** `px` screen pixels in layout pixels, at the current zoom. */
  const layoutPx = (px: number): number => {
    const width = screenSize().width;
    return width > 0 && surfaceSize.width > 0 ? (px * surfaceSize.width) / width : px;
  };

  /** 6 screen pixels of hit reach at any zoom, in layout pixels. */
  const hitTolerance = (): number => layoutPx(6);

  const hitAt = (state: ImageDocumentState, point: NormalizedPoint): ImageAnnotation | null =>
    annotationAt({
      annotations: state.annotations,
      point,
      context: context(state),
      tolerance: hitTolerance(),
    });

  const toView = (event: { clientX: number; clientY: number }): NormalizedPoint => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const setDraft = (next: ImageDocumentState | null) => {
    draftRef.current = next;
    draft.set(next);
  };

  const style = base.annotationStyle;
  const stamp = { color: style.color, size: style.size };

  /** The in-progress drawing, in view space. */
  const draftAnnotation = (gesture: Gesture, point: NormalizedPoint): ImageAnnotation | null => {
    switch (gesture.kind) {
      case "stroke":
        return { kind: gesture.tool, id: gesture.id, ...stamp, points: [...gesture.points] };
      case "arrow":
        return { kind: "arrow", id: gesture.id, ...stamp, from: gesture.from, to: point };
      case "rectangle":
        return {
          kind: "rectangle",
          id: gesture.id,
          ...stamp,
          // Inside the whole composition, so a box can go over a picture beside the base image.
          rect: rectFromPoints(gesture.from, point, bounds),
        };
      case "move":
      case "resize":
        return null;
      default: {
        const _exhaustive: never = gesture;
        return _exhaustive;
      }
    }
  };

  // --- text -----------------------------------------------------------------------------------
  const openText = (edit: TextEdit) => {
    setTextEdit(edit);
    if (edit.existing !== null) setDraft(removeImageAnnotation(base, edit.existing.id));
    // Focus after the textarea mounts.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const finishText = (commit: boolean) => {
    const edit = textEdit;
    if (edit === null) return;
    setTextEdit(null);
    setDraft(null);
    if (!commit) return;
    const text = edit.value.replace(/\s+$/, "");
    const existing = edit.existing;
    if (existing !== null && text === existing.text) {
      onCommit(base);
      return;
    }
    if (existing !== null && text === "") {
      onCommit(removeImageAnnotation(base, existing.id));
      return;
    }
    if (text === "") return;
    // The textarea showed the box's top-left; store the anchor that draws the text there.
    const anchor = textAnchorFromTopLeft({
      topLeft: edit.topLeft,
      text,
      fontSize: annotationFontSize(existing ?? stamp, source, scale),
      view: surfaceSize,
      orientation: base,
      measure: measureAnnotationText,
    });
    const at = viewPointToSource(anchor, base);
    onCommit(
      existing === null
        ? addImageAnnotation(base, { kind: "text", id: edit.id, ...stamp, at, text })
        : replaceImageAnnotation(base, { ...existing, at, text }),
    );
  };

  const editExistingText = (hit: TextAnnotation) => {
    if (!textFontReady) return;
    const box = annotationBounds(hit, context(base));
    openText({ id: hit.id, topLeft: { x: box.x, y: box.y }, value: hit.text, existing: hit });
  };

  // --- pointer --------------------------------------------------------------------------------
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || textEdit !== null) return;
    const point = toView(event);
    if (tool === "text") {
      event.preventDefault();
      const hit = hitAt(base, point);
      if (hit !== null && hit.kind === "text") {
        editExistingText(hit);
        return;
      }
      if (!textFontReady) return;
      openText({ id: randomId(), topLeft: point, value: "", existing: null });
      return;
    }
    event.preventDefault();
    captureRef.current?.setPointerCapture(event.pointerId);
    draftRef.current = null;
    const id = randomId();
    switch (tool) {
      case "select": {
        const hit = hitAt(base, point);
        onSelect(hit?.id ?? null);
        if (hit === null) {
          gestureRef.current = null;
          onEmptyPress?.(event);
          return;
        }
        gestureRef.current = {
          kind: "move",
          pointerId: event.pointerId,
          start: point,
          original: hit,
          base: { ...base, selectedAnnotationId: hit.id },
        };
        return;
      }
      case "pen":
      case "highlighter":
        gestureRef.current = {
          kind: "stroke",
          pointerId: event.pointerId,
          id,
          tool,
          points: [point],
        };
        return;
      case "arrow":
        gestureRef.current = { kind: "arrow", pointerId: event.pointerId, id, from: point };
        return;
      case "rectangle":
        gestureRef.current = { kind: "rectangle", pointerId: event.pointerId, id, from: point };
        return;
      default: {
        const _exhaustive: never = tool;
        return _exhaustive;
      }
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const point = toView(event);
    if (gesture === null) {
      if (tool === "select") {
        setHovering(hitAt(base, point) !== null);
      }
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "resize") {
      const { original } = gesture;
      setDraft(
        replaceImageAnnotation(
          gesture.base,
          resizeAnnotation({
            annotation: original,
            handle: gesture.handle,
            dx: point.x - gesture.start.x,
            dy: point.y - gesture.start.y,
            context: context(gesture.base),
            // Pictures keep their shape unless Shift frees it; other boxes lock with Shift.
            keepAspect: original.kind === "image" ? !event.shiftKey : event.shiftKey,
            minPixels: layoutPx(8),
          }),
        ),
      );
      return;
    }
    if (gesture.kind === "move") {
      setDraft(
        replaceImageAnnotation(
          gesture.base,
          moveAnnotation({
            annotation: gesture.original,
            dx: point.x - gesture.start.x,
            dy: point.y - gesture.start.y,
            geometry: gesture.base,
          }),
        ),
      );
      return;
    }
    if (gesture.kind === "stroke") gesture.points.push(point);
    const drawn = draftAnnotation(gesture, point);
    if (drawn !== null) setDraft(addImageAnnotation(base, annotationToSource(drawn, base)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    const drafted = draftRef.current;
    draftRef.current = null;
    draft.set(null);
    if (gesture.kind === "move" || gesture.kind === "resize") {
      if (drafted !== null) onCommit(drafted);
      return;
    }
    const drawn = draftAnnotation(gesture, toView(event));
    if (drawn === null || !isUsableAnnotation(drawn, screenSize())) return;
    onCommit(addImageAnnotation(base, annotationToSource(drawn, base)));
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setDraft(null);
  };

  /** A press on a resize handle of the selected annotation. */
  const onHandleDown = (
    event: ReactPointerEvent<HTMLElement>,
    handle: AnnotationHandle,
    original: ImageAnnotation,
  ) => {
    if (event.button !== 0 || textEdit !== null) return;
    event.preventDefault();
    event.stopPropagation();
    captureRef.current?.setPointerCapture(event.pointerId);
    draftRef.current = null;
    gestureRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      handle,
      start: toView(event),
      original,
      base: { ...base, selectedAnnotationId: original.id },
    };
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== "select") return;
    const hit = hitAt(base, toView(event));
    if (hit !== null && hit.kind === "text") editExistingText(hit);
  };

  // --- render ---------------------------------------------------------------------------------
  const selected =
    tool === "select" && textEdit === null
      ? (shown.annotations.find((a) => a.id === shown.selectedAnnotationId) ?? null)
      : null;
  const ready = surfaceSize.width > 0;
  const box = selected === null || !ready ? null : annotationBounds(selected, context(shown));
  // Handles act on the committed annotation, so a drag always starts from what was saved.
  const committed =
    selected === null ? null : (base.annotations.find((a) => a.id === selected.id) ?? null);
  const handles =
    selected === null || committed === null || !ready
      ? []
      : annotationHandles(selected, context(shown));

  const editing = textEdit;
  const editStyle = editing?.existing ?? null;
  const fontSize = annotationFontSize(editStyle ?? stamp, source, scale);

  return (
    <div ref={surfaceRef} className="pointer-events-none absolute inset-0 select-none">
      <div
        ref={captureRef}
        className="pointer-events-auto absolute touch-none"
        style={{
          left: pct(bounds.x),
          top: pct(bounds.y),
          width: pct(bounds.width),
          height: pct(bounds.height),
          cursor: tool === "select" && hovering ? "move" : CURSOR[tool],
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onDoubleClick={onDoubleClick}
        onPointerLeave={() => setHovering(false)}
        role="application"
        aria-label={
          tool === "select"
            ? `Image. ${isTouchPrimary() ? "Tap" : "Click"} a drawing or picture to select it.`
            : `Draw: ${tool}`
        }
      />
      {box === null ? null : (
        <div
          aria-hidden="true"
          className="absolute outline-solid outline-brand"
          style={{
            left: pct(box.x),
            top: pct(box.y),
            width: pct(box.width),
            height: pct(box.height),
            outlineWidth: unzoomedPx(1.5),
            outlineOffset: unzoomedPx(0),
          }}
        />
      )}
      {committed === null
        ? null
        : handles.map(({ handle, point }) => (
            <span
              key={handle}
              aria-hidden="true"
              data-handle={handle}
              onPointerDown={(event) => onHandleDown(event, handle, committed)}
              className="pointer-events-auto absolute flex touch-none items-center justify-center"
              style={{
                left: pct(point.x),
                top: pct(point.y),
                width: unzoomedPx(HANDLE_HIT),
                height: unzoomedPx(HANDLE_HIT),
                transform: "translate(-50%, -50%)",
                cursor: HANDLE_CURSOR[handle],
              }}
            >
              <span
                className={[
                  "block bg-n1 shadow-sm outline-solid outline-brand",
                  handle === "from" || handle === "to" ? "rounded-full" : "rounded-[2px]",
                ].join(" ")}
                style={{
                  width: unzoomedPx(HANDLE_SIZE),
                  height: unzoomedPx(HANDLE_SIZE),
                  outlineWidth: unzoomedPx(1.5),
                  outlineOffset: unzoomedPx(-1.5),
                }}
              />
            </span>
          ))}
      {editing === null ? null : (
        <TextEditor
          inputRef={inputRef}
          at={editing.topLeft}
          value={editing.value}
          color={editStyle?.color ?? stamp.color}
          fontSize={fontSize}
          onChange={(value) => setTextEdit({ ...editing, value })}
          onDone={finishText}
        />
      )}
    </div>
  );
}

/** Smallest font size iOS Safari focuses a field at without zooming the page. */
const MIN_FIELD_FONT_PX = 16;

/** Visible handle size and its touch target, in screen pixels at any zoom. */
const HANDLE_SIZE = 8;
const HANDLE_HIT = 22;

const HANDLE_CURSOR: Readonly<Record<AnnotationHandle, string>> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  from: "crosshair",
  to: "crosshair",
};

function TextEditor({
  inputRef,
  at,
  value,
  color,
  fontSize,
  onChange,
  onDone,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  at: NormalizedPoint;
  value: string;
  color: string;
  fontSize: number;
  onChange: (value: string) => void;
  onDone: (commit: boolean) => void;
}) {
  const lines = value.split("\n");
  // iOS Safari zooms the whole page into a focused field whose font is under 16px and leaves it
  // zoomed after the keyboard closes. Text on a fitted image is often smaller, so the field is
  // laid out at least that large and scaled back down to the text's size on the canvas; Safari
  // reads the computed font size, which a transform doesn't change.
  const upscale = Math.max(1, MIN_FIELD_FONT_PX / fontSize);
  const fieldFontSize = fontSize * upscale;
  // Sized from the renderer's own measurement so wide glyphs never wrap onto a hidden line.
  const widest = Math.max(0, ...lines.map((line) => measureAnnotationText(line, fieldFontSize)));
  const width = Math.max(
    Math.ceil(fieldFontSize * 1.5),
    Math.ceil(widest + Math.max(12 * upscale, fieldFontSize * 0.6)),
  );
  const height = Math.ceil(lines.length * fieldFontSize * TEXT_LINE_HEIGHT);
  return (
    <textarea
      ref={inputRef}
      aria-label="Text"
      value={value}
      rows={lines.length}
      wrap="off"
      spellCheck={false}
      onChange={(event) => onChange(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={() => onDone(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          onDone(false);
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onDone(true);
        }
      }}
      className="pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-1 outline-offset-2 outline-brand outline-dashed"
      style={{
        left: pct(at.x),
        top: pct(at.y),
        color,
        caretColor: color,
        fontFamily: '"Sidebar Inter", system-ui, sans-serif',
        fontWeight: 600,
        fontSize: `${fieldFontSize}px`,
        lineHeight: TEXT_LINE_HEIGHT,
        whiteSpace: "pre",
        width: `${width}px`,
        height: `${height}px`,
        transform: upscale === 1 ? undefined : `scale(${1 / upscale})`,
        transformOrigin: "0 0",
        // The scale shrinks the outline too; widen it by as much so it keeps its screen size.
        outlineWidth: unzoomedPx(upscale),
        outlineOffset: unzoomedPx(2 * upscale),
      }}
    />
  );
}
