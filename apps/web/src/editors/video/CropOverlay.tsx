import {
  resizeCrop,
  type CropHandle,
  type FrameSize,
  type NormalizedRect,
  type VideoCropAspect,
} from "@edit-here/core";
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type CropOverlayProps = {
  readonly rect: NormalizedRect;
  readonly aspect: VideoCropAspect;
  readonly frame: FrameSize;
  /** Called on every move with `commit: false`, then once on release with `commit: true`. */
  readonly onChange: (rect: NormalizedRect, commit: boolean) => void;
};

type Drag = {
  readonly handle: CropHandle;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly startRect: NormalizedRect;
  readonly boxWidth: number;
  readonly boxHeight: number;
  latest: NormalizedRect;
};

/** Handle anchors on the crop box: corners get square grips, edges get short bars. */
const HANDLES: ReadonlyArray<{
  handle: Exclude<CropHandle, "move">;
  style: CSSProperties;
  cursor: string;
}> = [
  { handle: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { handle: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { handle: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { handle: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { handle: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { handle: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { handle: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
  { handle: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
];

const HANDLE_LABELS: Readonly<Record<Exclude<CropHandle, "move">, string>> = {
  nw: "top-left corner",
  ne: "top-right corner",
  sw: "bottom-left corner",
  se: "bottom-right corner",
  n: "top edge",
  s: "bottom edge",
  w: "left edge",
  e: "right edge",
};

/** Crop rectangle over the video box: drag inside to move, drag handles to resize. */
export function CropOverlay({ rect, aspect, frame, onChange }: CropOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const begin = (handle: CropHandle) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const box = rootRef.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return;
    event.preventDefault();
    event.stopPropagation();
    rootRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRect: rect,
      boxWidth: box.width,
      boxHeight: box.height,
      latest: rect,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const next = resizeCrop({
      rect: current.startRect,
      handle: current.handle,
      dx: (event.clientX - current.startX) / current.boxWidth,
      dy: (event.clientY - current.startY) / current.boxHeight,
      aspect,
      frame,
    });
    current.latest = next;
    onChange(next, false);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    drag.current = null;
    onChange(current.latest, true);
  };

  const box: CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-10 touch-none overflow-hidden select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        role="group"
        aria-label="Crop area"
        className="absolute cursor-move shadow-[0_0_0_9999px_color-mix(in_srgb,var(--neutral-1)_70%,transparent),inset_0_0_0_1px_var(--neutral-10)]"
        style={box}
        onPointerDown={begin("move")}
      >
        {/* Rule-of-thirds guides */}
        <div className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-n10/35" />
        <div className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-n10/35" />
        <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-n10/35" />
        <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-n10/35" />
        {HANDLES.map(({ handle, style, cursor }) => {
          const corner = handle.length === 2;
          const vertical = handle === "n" || handle === "s";
          return (
            <div
              key={handle}
              aria-label={`Resize from ${HANDLE_LABELS[handle]}`}
              // 32px touch target around a smaller visible grip.
              className="absolute z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ ...style, cursor }}
              onPointerDown={begin(handle)}
            >
              <div
                className={`rounded-[2px] bg-n10 shadow-sm ${
                  corner ? "size-3" : vertical ? "h-1.5 w-5" : "h-5 w-1.5"
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
