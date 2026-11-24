import { useSyncExternalStore } from "react";

/** Phone widths, matching Tailwind's `max-sm:` variant. */
const NARROW_QUERY = "(max-width: 639.98px)";

function subscribeNarrow(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True on phone widths, where the editors move their controls into a bottom thumb-zone dock. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}
