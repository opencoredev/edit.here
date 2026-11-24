import { Cancel01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useRef } from "react";
import type { StarPromptPlacement } from "../lib/analytics";
import { REPO_URL } from "../lib/repo";
import { Icon } from "./Icon";

/**
 * Where the pill sits, clear of every toolbar, options tray, canvas, zoom pill, timeline, and
 * home card at every viewport width:
 * - Home (all widths): sits in normal flex flow right between the header and `<main>`, so it
 *   can never cover recent project cards or sample pills regardless of width or scroll position.
 * - Editors at >= 1280px (`xl:`): floats top right under the header, 67px+ clear of the centered
 *   toolbar and above the options tray and canvas top margin.
 * - Editors below 1280px (`max-xl:`, e.g. 1024px, 768px, 390px): sits in normal flex flow right
 *   between the header and `<main>`, pushing the editor stage down so it can never overlap any
 *   toolbar button or canvas pixel.
 */
const WRAPPER_CLASS: Record<StarPromptPlacement, string> = {
  home: "z-30 flex shrink-0 justify-center bg-canvas px-2.5 pb-1.5",
  image:
    "z-30 xl:fixed xl:top-14 xl:right-3 max-xl:flex max-xl:shrink-0 max-xl:justify-center max-xl:bg-canvas max-xl:px-2.5 max-xl:pb-1.5",
  video:
    "z-30 xl:fixed xl:top-14 xl:right-3 max-xl:flex max-xl:shrink-0 max-xl:justify-center max-xl:bg-canvas max-xl:px-2.5 max-xl:pb-1.5",
};

/**
 * The pill that asks returning visitors to star the repo, drawn and animated; `StarPromptHost`
 * decides when it shows. The link is a real link (Enter or click opens GitHub in a new tab);
 * either answer hides the prompt for good.
 */
export function StarPrompt({
  visible,
  placement,
  onStar,
  onDismiss,
}: {
  visible: boolean;
  /** Where it sits: Home, or over the open editor. */
  placement: StarPromptPlacement;
  /** The GitHub link was opened (click, Enter or middle click). */
  onStar: (placement: StarPromptPlacement) => void;
  /** The dismiss button was pressed. */
  onDismiss: (placement: StarPromptPlacement) => void;
}) {
  const reduced = useReducedMotion() === true;
  const dismissSpaceHeld = useRef(false);

  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          key="star-prompt"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "top center" }}
          className={WRAPPER_CLASS[placement]}
        >
          <div className="alloy-panel flex items-center gap-2.5 py-1.5 pr-1.5 pl-3 text-sm shadow-lg max-sm:w-full">
            <Icon icon={StarIcon} className="size-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 text-ink-muted max-sm:truncate">
              Enjoying edit.here?
            </span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onStar(placement)}
              onAuxClick={(event) => {
                // A middle click opens the repo in a background tab: that answers it too.
                if (event.button === 1) onStar(placement);
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
              onClick={() => onDismiss(placement)}
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
                  onDismiss(placement);
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
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
