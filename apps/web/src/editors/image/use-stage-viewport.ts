import {
  actualSizeZoom,
  clampViewport,
  FIT_VIEWPORT,
  MAX_VIEWPORT_ZOOM,
  pinchViewport,
  VIEWPORT_ZOOM_STEP,
  wheelDeltaPixels,
  wheelZoomFactor,
  zoomViewportAt,
  type ImageSize,
  type Viewport,
  type ViewPoint,
} from "@edit-here/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { isEditableTarget } from "../../lib/platform";

/** What the editor's keyboard handler and the overlays can ask of the stage. */
export type StageViewportController = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Jumps to `viewport` (clamped), e.g. to keep the picture still when the layout changes. */
  setViewport: (viewport: Viewport) => void;
  /** Toggles between 100% (one image pixel per CSS pixel) and fit. */
  actual: () => void;
  /**
   * Starts a pan from a press on empty image space in select mode. Returns whether it claimed
   * the press; panning works at every zoom.
   */
  panFromPress: (event: { pointerId: number; clientX: number; clientY: number }) => boolean;
};

type Drag =
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly from: ViewPoint;
      readonly start: Viewport;
    }
  | {
      readonly kind: "pinch";
      readonly ids: readonly [number, number];
      readonly from: readonly [ViewPoint, ViewPoint];
      readonly start: Viewport;
    }
  /** A pinch ended with a finger still down; nothing happens until every finger lifts. */
  | { readonly kind: "settling" };

/** Space pans unless it belongs to a text field, a dialog/menu, or a keyboard-focused control. */
function spaceIsForStage(target: EventTarget | null, keyboardFocus: boolean): boolean {
  if (isEditableTarget(target)) return false;
  if (!(target instanceof Element)) return true;
  if (target.closest('[role="dialog"], [role="menu"]') !== null) return false;
  if (target === document.body) return true;
  return !keyboardFocus;
}

function readNumber(event: Event, key: string): number | null {
  const value: unknown = Reflect.get(event, key);
  return typeof value === "number" ? value : null;
}

/**
 * Zoom and pan for the image stage: wheel and trackpad, Space or middle-button drag, two-finger
 * touch, and the controller for keys and buttons. `content` is the fitted image size and
 * `stage` the box it fits in; `pixels` is the shown image's size in image pixels. `maxZoom` is
 * the zoom ceiling, `MAX_VIEWPORT_ZOOM` unless the stage raises it (see `stageMaxZoom`).
 */
export function useStageViewport({
  rootRef,
  contentRef,
  content,
  stage,
  pixels,
  maxZoom = MAX_VIEWPORT_ZOOM,
}: {
  rootRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  content: ImageSize;
  stage: ImageSize;
  pixels: ImageSize;
  maxZoom?: number | undefined;
}) {
  const [raw, setRaw] = useState<Viewport>(FIT_VIEWPORT);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const viewport = useMemo(
    () => clampViewport({ viewport: raw, content, stage, maxZoom }),
    [raw, content, stage, maxZoom],
  );

  const live = useRef({ viewport, content, stage, pixels, maxZoom });
  // The viewport the DOM currently shows; `live` can run ahead of it between renders.
  const rendered = useRef(viewport);
  useLayoutEffect(() => {
    live.current = { viewport, content, stage, pixels, maxZoom };
    rendered.current = viewport;
  });
  const spaceRef = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  const touches = useRef(new Map<number, { clientX: number; clientY: number }>());

  const apply = useCallback((next: (current: Viewport) => Viewport) => {
    const { viewport: current, content: c, stage: s, maxZoom: m } = live.current;
    const clamped = clampViewport({ viewport: next(current), content: c, stage: s, maxZoom: m });
    live.current = { ...live.current, viewport: clamped };
    setRaw(clamped);
  }, []);

  /** A client point relative to where the fit centers the image. */
  const toAnchor = useCallback(
    (point: { clientX: number; clientY: number }): ViewPoint => {
      const rect = contentRef.current?.getBoundingClientRect();
      if (rect === undefined) return { x: 0, y: 0 };
      const v = rendered.current;
      return {
        x: point.clientX - (rect.left + rect.width / 2 - v.x),
        y: point.clientY - (rect.top + rect.height / 2 - v.y),
      };
    },
    [contentRef],
  );

  const zoomBy = useCallback(
    (factor: number, anchor: ViewPoint = { x: 0, y: 0 }) =>
      apply((v) =>
        zoomViewportAt({
          viewport: v,
          zoom: v.zoom * factor,
          anchor,
          maxZoom: live.current.maxZoom,
        }),
      ),
    [apply],
  );

  const beginPan = useCallback(
    (event: { pointerId: number; clientX: number; clientY: number }) => {
      rootRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        start: live.current.viewport,
      };
      setDragging(true);
    },
    [rootRef],
  );

  const controller = useMemo(
    (): StageViewportController => ({
      zoomIn: () => zoomBy(VIEWPORT_ZOOM_STEP),
      zoomOut: () => zoomBy(1 / VIEWPORT_ZOOM_STEP),
      fit: () => apply(() => FIT_VIEWPORT),
      setViewport: (next) => apply(() => next),
      actual: () => {
        const { viewport: v, pixels: p, content: c, maxZoom: m } = live.current;
        const target = actualSizeZoom({ pixels: p, fitted: c, maxZoom: m });
        apply(() =>
          Math.abs(v.zoom - target) < 0.001
            ? FIT_VIEWPORT
            : zoomViewportAt({ viewport: v, zoom: target, anchor: { x: 0, y: 0 }, maxZoom: m }),
        );
      },
      panFromPress: (event) => {
        beginPan(event);
        return true;
      },
    }),
    [apply, zoomBy, beginPan],
  );

  // Space: hand tool while held, from any tool. Track pointer vs Tab focus so clicking a
  // toolbar button and then holding Space pans instead of activating the button.
  useEffect(() => {
    let keyboardFocus = false;
    const onPointerDown = () => {
      keyboardFocus = false;
    };
    const release = () => {
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        keyboardFocus = true;
        return;
      }
      if (event.key !== " " || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!spaceIsForStage(event.target, keyboardFocus)) return;
      event.preventDefault();
      if (spaceRef.current) return;
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " " || !spaceRef.current) return;
      // Keeps a mouse-focused button from firing on release.
      event.preventDefault();
      release();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  // Wheel and Safari's trackpad gesture events need non-passive listeners to stop page zoom.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onWheel = (event: WheelEvent) => {
      const page = root.clientHeight;
      const dx = wheelDeltaPixels(event.deltaX, event.deltaMode, page);
      const dy = wheelDeltaPixels(event.deltaY, event.deltaMode, page);
      // Trackpad pinch arrives as Ctrl+wheel; Cmd and Alt make a mouse wheel zoom too.
      if (event.ctrlKey || event.metaKey || event.altKey) {
        event.preventDefault();
        zoomBy(wheelZoomFactor(dy), toAnchor(event));
        return;
      }
      // Two-finger trackpad scroll (and a plain mouse wheel) pans at every zoom.
      event.preventDefault();
      // Shift turns a mouse wheel's vertical scroll sideways.
      const sideways = event.shiftKey && dx === 0;
      const panX = sideways ? dy : dx;
      const panY = sideways ? 0 : dy;
      apply((v) => ({ ...v, x: v.x - panX, y: v.y - panY }));
    };
    let gestureStart: { zoom: number; anchor: ViewPoint } | null = null;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      if (touches.current.size >= 2) return;
      const x = readNumber(event, "clientX") ?? 0;
      const y = readNumber(event, "clientY") ?? 0;
      gestureStart = {
        zoom: live.current.viewport.zoom,
        anchor: toAnchor({ clientX: x, clientY: y }),
      };
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const scale = readNumber(event, "scale");
      // Touch pinches on iOS also fire these; pointer events already handle those.
      if (gestureStart === null || scale === null || touches.current.size >= 2) return;
      const { zoom, anchor } = gestureStart;
      apply((v) =>
        zoomViewportAt({ viewport: v, zoom: zoom * scale, anchor, maxZoom: live.current.maxZoom }),
      );
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      gestureStart = null;
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("gesturestart", onGestureStart);
    root.addEventListener("gesturechange", onGestureChange);
    root.addEventListener("gestureend", onGestureEnd);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("gesturestart", onGestureStart);
      root.removeEventListener("gesturechange", onGestureChange);
      root.removeEventListener("gestureend", onGestureEnd);
    };
  }, [rootRef, apply, zoomBy, toAnchor]);

  const touchPair = (ids: readonly [number, number]): [ViewPoint, ViewPoint] | null => {
    const a = touches.current.get(ids[0]);
    const b = touches.current.get(ids[1]);
    return a === undefined || b === undefined ? null : [toAnchor(a), toAnchor(b)];
  };

  /** Capture phase: claims presses that pan or pinch before the tool overlays see them. */
  const onPointerDownCapture = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") {
      touches.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (touches.current.size === 1 && dragRef.current === null) return;
      event.stopPropagation();
      event.preventDefault();
      const ids = [...touches.current.keys()];
      const first = ids[0];
      const second = ids[1];
      if (touches.current.size !== 2 || first === undefined || second === undefined) return;
      // Taking capture of the first finger cancels the stroke the tool overlay began with it.
      const root = rootRef.current;
      for (const id of [first, second]) {
        if (root !== null && !root.hasPointerCapture(id)) {
          try {
            root.setPointerCapture(id);
          } catch {
            // The pointer may already be gone.
          }
        }
      }
      const pair = touchPair([first, second]);
      if (pair === null) return;
      dragRef.current = {
        kind: "pinch",
        ids: [first, second],
        from: pair,
        start: live.current.viewport,
      };
      setDragging(true);
      return;
    }
    const middle = event.button === 1;
    if (!middle && !(event.button === 0 && spaceRef.current)) return;
    event.stopPropagation();
    event.preventDefault();
    beginPan(event);
  };

  /**
   * Bubble phase: a primary press that no tool overlay or control claimed, such as one on the
   * stage around the image or on the frame padding, pans.
   */
  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || dragRef.current !== null || event.defaultPrevented) return;
    if (event.pointerType === "touch" && touches.current.size > 1) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-stage-overlay], button, input, [role='toolbar']") !== null) return;
    beginPan(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    const drag = dragRef.current;
    if (drag === null) return;
    switch (drag.kind) {
      case "pan": {
        if (drag.pointerId !== event.pointerId) return;
        const x = drag.start.x + event.clientX - drag.from.x;
        const y = drag.start.y + event.clientY - drag.from.y;
        apply(() => ({ ...drag.start, x, y }));
        return;
      }
      case "pinch": {
        if (!drag.ids.includes(event.pointerId)) return;
        const to = touchPair(drag.ids);
        if (to === null) return;
        apply(() =>
          pinchViewport({ start: drag.start, from: drag.from, to, maxZoom: live.current.maxZoom }),
        );
        return;
      }
      case "settling":
        return;
      default: {
        const _exhaustive: never = drag;
        return _exhaustive;
      }
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    touches.current.delete(event.pointerId);
    const drag = dragRef.current;
    if (drag === null) return;
    const ended =
      (drag.kind === "pan" && drag.pointerId === event.pointerId) ||
      (drag.kind === "pinch" && drag.ids.includes(event.pointerId));
    if (ended) {
      dragRef.current =
        drag.kind === "pinch" && touches.current.size > 0 ? { kind: "settling" } : null;
      setDragging(false);
    }
    if (dragRef.current?.kind === "settling" && touches.current.size === 0) dragRef.current = null;
  };

  return {
    viewport,
    controller,
    spaceHeld,
    dragging,
    handlers: {
      onPointerDownCapture,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => {
        // Overlays losing capture to the stage bubble up here too; only the stage's own counts.
        if (event.target !== event.currentTarget) return;
        const drag = dragRef.current;
        if (drag?.kind === "pan" && drag.pointerId === event.pointerId) onPointerEnd(event);
      },
    },
  };
}
