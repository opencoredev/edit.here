import { formatKeyCombo, type KeyCombo } from "@edit-here/core";
import type { Platform } from "../lib/platform";

/** Renders one shortcut combo as keycaps, e.g. ⌘ ⇧ Z. */
export function Keys({ combo, platform }: { combo: KeyCombo; platform: Platform }) {
  const tokens = formatKeyCombo(combo, platform);
  return (
    <span className="inline-flex items-center gap-1" aria-label={tokens.join(" ")}>
      {tokens.map((token, index) => (
        <kbd key={`${token}-${index}`} aria-hidden="true">
          {token}
        </kbd>
      ))}
    </span>
  );
}
