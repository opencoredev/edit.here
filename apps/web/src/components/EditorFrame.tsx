import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useIsNarrow } from "../lib/use-is-narrow";

/*
 * Layout direction for the editors.
 * Desktop reference: CleanShot X's annotate window (tools in one strip over the image, options
 *   for the active tool right under it) and Figma's floating toolbar.
 * Phone reference: iOS Photos and Markup, CapCut. Tools and the active tool's options float
 *   together in the bottom thumb zone as rounded pills: options directly above a labeled tool
 *   rail, so the eye and the thumb stay in one place.
 * Palette and type: the Alloy theme as captured (neutral canvas, color-1 accent, Inter).
 * Avoiding: bordered cards around canvases, side panels, stacked control strips, unlabeled icon
 *   strips on touch screens, edge-to-edge slabs fighting the browser's own bottom bar.
 */

/** Height of an element, kept current with a ResizeObserver. Follows the element across remounts. */
function useHeight(): [number, (element: HTMLElement | null) => void] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver(() => setHeight(Math.ceil(element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const ref = useCallback((next: HTMLElement | null) => setElement(next), []);
  return [element === null ? 0 : height, ref];
}

type EditorFrameProps = {
  /** The tool bar: floating at the top center on desktop, at the bottom on phones. */
  bar: ReactNode;
  /**
   * Options for the active tool, or null when it has none right now. Leave it out for an editor
   * that never shows options, so no space is reserved for them.
   */
  tray?: ReactNode;
  trayLabel?: string;
  children: ReactNode;
};

/** Space between the header and the stage on phones, where nothing floats at the top. */
const PHONE_DOCK_TOP = 8;

/**
 * Full-bleed stage with floating controls. On desktop the tool bar and its options row float at
 * the top; on phones both sit in a bottom dock. The space they take is published as
 * `--dock-top` and `--dock-bottom`, so the stage keeps its content clear of them.
 */
export function EditorFrame({ bar, tray, trayLabel = "Options", children }: EditorFrameProps) {
  const hasTray = tray !== undefined && tray !== null;
  const narrow = useIsNarrow();
  const [top, topRef] = useHeight();
  const [bottom, bottomRef] = useHeight();

  // Toasts sit just under the desktop bar and its options row, so they never cover a control.
  // On phones nothing floats at the top, and toasts sit under the header.
  useEffect(() => {
    if (narrow) return;
    const root = document.documentElement;
    root.style.setProperty("--editor-chrome-top", `${top}px`);
    return () => {
      root.style.removeProperty("--editor-chrome-top");
    };
  }, [top, narrow]);

  const style: CSSProperties & Record<"--dock-top" | "--dock-bottom", string> = narrow
    ? { "--dock-top": `${PHONE_DOCK_TOP}px`, "--dock-bottom": `${bottom}px` }
    : { "--dock-top": `${top === 0 ? 56 : top}px`, "--dock-bottom": "0px" };

  return (
    <div style={style} className="relative flex min-h-0 flex-1 flex-col">
      {children}
      {narrow ? (
        <div
          ref={bottomRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 px-2.5 pb-[max(10px,env(safe-area-inset-bottom))]"
        >
          {tray === undefined ? null : (
            // One options row is always reserved, so picking a tool never moves the image.
            <div className="flex min-h-12 flex-col justify-end">
              <OptionsRow open={hasTray} label={trayLabel} sheet>
                {tray}
              </OptionsRow>
            </div>
          )}
          {bar}
        </div>
      ) : (
        <div
          ref={topRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-4 pt-1 pb-3"
        >
          {bar}
          {tray === undefined ? null : (
            // The row's slot has a fixed height, so switching tools never resizes the stage. A
            // taller row (a wrapped one, or the JPEG note) overflows over the stage's padding.
            <div className="flex h-12 w-full items-start justify-center">
              <OptionsRow open={hasTray} label={trayLabel}>
                {tray}
              </OptionsRow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A row that scrolls sideways with fading edges wherever more content hides past them. When the
 * pressed control (the active tool) changes and sits outside the visible part, the row scrolls
 * to center it; a row the user swiped stays put until the active tool changes.
 */
export function FadeScroller({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = () => {
      const max = element.scrollWidth - element.clientWidth;
      element.toggleAttribute("data-fade-start", element.scrollLeft > 1);
      element.toggleAttribute("data-fade-end", element.scrollLeft < max - 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild !== null) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);
  const reduced = useReducedMotion() === true;
  const lastPressed = useRef<Element | null>(null);
  // Runs after every render: cheap, and only scrolls when the pressed control changes.
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const pressed = element.querySelector<HTMLElement>('[aria-pressed="true"]');
    const previous = lastPressed.current;
    if (pressed === previous) return;
    lastPressed.current = pressed;
    if (pressed === null) return;
    const start = pressed.getBoundingClientRect().left - element.getBoundingClientRect().left;
    const width = pressed.offsetWidth;
    if (start < 0 || start + width > element.clientWidth) {
      element.scrollTo({
        left: element.scrollLeft + start - (element.clientWidth - width) / 2,
        // Jump on first show or reduced motion; glide when the user picks another tool.
        behavior: previous === null || reduced ? "instant" : "smooth",
      });
    }
  });
  return (
    <div ref={ref} className={["fade-scroller min-w-0", className ?? ""].join(" ")}>
      <div className={["mx-auto flex w-max items-center", innerClassName ?? ""].join(" ")}>
        {children}
      </div>
    </div>
  );
}

/** Phones: a swipeable `FadeScroller` that takes the row's free width. Desktop: the children as is. */
export function PhoneScroller({ children }: { children: ReactNode }) {
  const narrow = useIsNarrow();
  if (!narrow) return children;
  return <FadeScroller className="flex-1 py-0.5">{children}</FadeScroller>;
}

/**
 * The tool bar. On desktop it floats at the top center; on phones it is a rounded rail in the
 * bottom dock whose labeled tiles scroll sideways, with fading edges hinting at more tools.
 */
export function DockBar({ label, children }: { label: string; children: ReactNode }) {
  const narrow = useIsNarrow();
  if (narrow) {
    return (
      <div
        role="toolbar"
        aria-label={label}
        className="dock-surface pointer-events-auto w-full rounded-lg p-1"
      >
        <FadeScroller innerClassName="gap-0.5">{children}</FadeScroller>
      </div>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="dock-surface pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md p-1 [scrollbar-width:none]"
    >
      {children}
    </div>
  );
}

/** Thin divider between groups in a bar. */
export function DockDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={["mx-1 h-5 w-px shrink-0 bg-line max-sm:h-7", className ?? ""].join(" ")}
    />
  );
}

/**
 * Options for the active tool: a compact row under the bar, or a rounded pill above the tool
 * rail on phones. Only
 * appearing and disappearing animate; switching between tools with options swaps content
 * instantly, since tool switches are frequent keyboard actions.
 */
function OptionsRow({
  open,
  label,
  sheet = false,
  children,
}: {
  open: boolean;
  label: string;
  sheet?: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() === true;
  const offset = sheet ? 8 : -4;
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.section
          key="options"
          aria-label={label}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: offset }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className={
            sheet
              ? "dock-surface pointer-events-auto flex min-h-12 w-full flex-col justify-center rounded-lg px-2 py-1"
              : "dock-surface pointer-events-auto max-w-full overflow-x-auto rounded-md px-3 py-1 [scrollbar-width:none]"
          }
        >
          {children}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}

/** A labelled group inside the options row: small caption and its control. Phones drop the caption. */
export function TrayGroup({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["flex min-w-0 items-center gap-2", className ?? ""].join(" ")}>
      {label === undefined ? null : (
        <span className="shrink-0 text-xs text-ink-muted max-sm:sr-only">{label}</span>
      )}
      {children}
    </div>
  );
}

/** Lays out tray groups in a single horizontal line; scrolls sideways when narrower than the tray. */
export function TrayRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-x-3 gap-y-3 max-sm:gap-x-2 sm:w-max sm:flex-nowrap">
      {children}
    </div>
  );
}
