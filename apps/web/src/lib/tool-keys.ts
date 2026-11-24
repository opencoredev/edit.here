import { KEYBIND_CATALOG, type KeybindAction, type KeyCombo } from "@edit-here/core";

export type NumberedHint = {
  readonly combo: KeyCombo;
  readonly altCombo: KeyCombo | undefined;
  readonly badge: string;
};

/**
 * Tool-bar hint for a numbered action: the number is the badge and the tooltip's first key, the
 * letter mnemonic (the catalog's second key) the alternative.
 */
export function numberedHint(action: KeybindAction): NumberedHint {
  const keys: readonly KeyCombo[] = KEYBIND_CATALOG[action].keys;
  const combo = keys[0] ?? "";
  return { combo, altCombo: keys[1], badge: combo };
}
