import type { MediaKind } from "@edit-here/core";
import { Cancel01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { REPO_URL } from "../lib/repo";
import { Icon } from "./Icon";

/** A calm pause after the page settles, so the prompt never flashes in during startup. */
const SHOW_DELAY_MS = 800;

/**
 * Where the pill floats, clear of each view's own floating controls and canvases. Home: bottom
 * right. Both editors: top right under the header (above the canvas top margin, clear of the
 * centered tool bar, options tray, bottom zoom pill and video timeline), and full-width under
 * the header on phones (where the dock owns the bottom).
 */
const PLACEMENT: Record<MediaKind | "home", string> = {
  home: "right-4 bottom-4 max-sm:inset-x-3 max-sm:bottom-3",
  image: "top-14 right-3 max-sm:inset-x-2.5 max-sm:top-14",
  video: "top-14 right-3 max-sm:inset-x-2.5 max-sm:top-14",
};

/**
 * A small floating ask to star the repo, shown to returning visitors. The link is a real link
 * (Enter or click opens GitHub in a new tab); either answer hides the prompt for good.
 */
export function StarPrompt({
  active,
  kind,
  onDismiss,
}: {
  /** Eligible and the page is ready; the pill appears after a short pause. */
  active: boolean;
  /** The open editor, or `null` on Home. */
  kind: MediaKind | null;
  onDismiss: () => void;
}) {
  const reduced = useReducedMotion() === true;
  const [settled, setSettled] = useState(false);
  const dismissSpaceHeld = useRef(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSettled(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const placement = kind ?? "home";
  const fromTop = kind !== null;

  return (
    <AnimatePresence>
      {active && settled ? (
        <motion.div
          key={placement}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: fromTop ? -6 : 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: fromTop ? -4 : 4, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: fromTop ? "top center" : "bottom center" }}
          className={`alloy-panel fixed z-30 flex items-center gap-2.5 py-1.5 pr-1.5 pl-3 text-sm shadow-lg ${PLACEMENT[placement]}`}
        >
          <Icon icon={StarIcon} className="size-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 text-ink-muted max-sm:truncate">Enjoying edit.here?</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onDismiss}
            onAuxClick={(event) => {
              // A middle click opens the repo in a background tab: that answers it too.
              if (event.button === 1) onDismiss();
            }}
            onKeyDown={(event) => {
              // Space is not a link key. Keep it from scrolling or reaching the editors, where
              // it plays video or pans the image.
              if (event.key === " ") event.preventDefault();
            }}
            className="shrink-0 rounded-xs px-1 py-1 font-medium whitespace-nowrap text-ink underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand"
          >
            Star on GitHub
          </a>
          <button
            type="button"
            onClick={onDismiss}
            onKeyDown={(event) => {
              // Claim Space before the video editor's global play/pause shortcut sees it, then
              // dismiss on keyup like a native button.
              if (event.key === " ") {
                event.preventDefault();
                dismissSpaceHeld.current = true;
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " && dismissSpaceHeld.current) {
                dismissSpaceHeld.current = false;
                event.preventDefault();
                onDismiss();
              }
            }}
            onBlur={() => {
              dismissSpaceHeld.current = false;
            }}
            className="shrink-0 rounded-xs p-1.5 text-ink-muted hover:bg-n3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand max-sm:p-2"
            aria-label="Dismiss"
          >
            <Icon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
