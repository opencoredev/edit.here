import type { MediaKind } from "@edit-here/core";
import { useEffect, useRef, useState } from "react";
import type { StarPromptPlacement } from "../lib/analytics";
import { AppearanceLatch } from "../lib/star-prompt";
import { StarPrompt } from "./StarPrompt";

/** A calm pause after the page settles, so the prompt never flashes in during startup. */
const SHOW_DELAY_MS = 800;

/**
 * Decides when the star prompt shows and where, and reports each appearance. The pill ships with
 * Home (Motion's `m` components under the app's `LazyMotion`), so it shows exactly when this says.
 */
export function StarPromptHost({
  active,
  kind,
  onShown,
  onStar,
  onDismiss,
}: {
  /** Eligible and the page is ready; the pill appears after a short pause. */
  active: boolean;
  /** The open editor, or `null` on Home. */
  kind: MediaKind | null;
  /** The pill appeared (once per appearance). */
  onShown: (placement: StarPromptPlacement) => void;
  /** The GitHub link was opened (click, Enter or middle click). */
  onStar: (placement: StarPromptPlacement) => void;
  /** The dismiss button was pressed. */
  onDismiss: (placement: StarPromptPlacement) => void;
}) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSettled(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const placement: StarPromptPlacement = kind ?? "home";
  const visible = active && settled;

  // Report each appearance once, with the placement it appeared in. Moving between Home and an
  // editor while it shows is not a new appearance; the answer carries where it was given. The
  // latch survives StrictMode re-running the effect.
  const [shownLatch] = useState(() => new AppearanceLatch());
  const latestShown = useRef({ onShown, placement });
  useEffect(() => {
    latestShown.current = { onShown, placement };
  });
  useEffect(() => {
    if (shownLatch.update(visible)) latestShown.current.onShown(latestShown.current.placement);
  }, [visible, shownLatch]);

  return (
    <StarPrompt visible={visible} placement={placement} onStar={onStar} onDismiss={onDismiss} />
  );
}
