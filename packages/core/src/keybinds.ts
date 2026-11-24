import type { MediaKind } from "./types";

export type KeybindScope = "global" | MediaKind;

/**
 * Key combos use `KeyboardEvent.key` names joined with `+`. `Mod` is Cmd on macOS and Ctrl
 * elsewhere. `Space` stands for the `" "` key.
 */
export type KeyCombo = string;

type KeybindDefinition = {
  readonly scope: KeybindScope;
  readonly keys: readonly [KeyCombo, ...KeyCombo[]];
  readonly label: string;
};

export const KEYBIND_CATALOG = {
  "global.help": { scope: "global", keys: ["?"], label: "Show keyboard shortcuts" },
  "global.undo": { scope: "global", keys: ["Mod+Z"], label: "Undo" },
  "global.redo": { scope: "global", keys: ["Mod+Shift+Z", "Mod+Y"], label: "Redo" },
  "global.export": { scope: "global", keys: ["Mod+E"], label: "Export" },
  "global.copy": { scope: "global", keys: ["Mod+C"], label: "Copy result to clipboard" },
  "global.escape": { scope: "global", keys: ["Escape"], label: "Close dialog or deselect" },

  // Tools take 1–9 in tool-bar order; the letter mnemonics stay as aliases.
  "image.select": { scope: "image", keys: ["1", "v"], label: "Select and move" },
  "image.pen": { scope: "image", keys: ["2", "p"], label: "Pen" },
  "image.highlighter": { scope: "image", keys: ["3", "h"], label: "Highlighter" },
  "image.arrow": { scope: "image", keys: ["4", "a"], label: "Arrow" },
  "image.rectangle": { scope: "image", keys: ["5", "u"], label: "Rectangle" },
  "image.text": { scope: "image", keys: ["6", "x"], label: "Text" },
  "image.redact": { scope: "image", keys: ["7", "r"], label: "Redact tool" },
  "image.crop": { scope: "image", keys: ["8", "c"], label: "Crop tool" },
  "image.frame": { scope: "image", keys: ["9", "b"], label: "Frame and background" },
  "image.done": { scope: "image", keys: ["Enter"], label: "Finish crop" },
  "image.transparent": { scope: "image", keys: ["t"], label: "Toggle transparent background" },
  "image.rotate": { scope: "image", keys: ["Shift+R", "]"], label: "Rotate 90°" },
  "image.flip": { scope: "image", keys: ["f"], label: "Flip horizontally" },
  "image.reset": { scope: "image", keys: ["0"], label: "Reset crop, rotation and flip" },
  "image.zoomIn": { scope: "image", keys: ["=", "+"], label: "Zoom in" },
  "image.zoomOut": { scope: "image", keys: ["-"], label: "Zoom out" },
  "image.zoomReset": { scope: "image", keys: ["Mod+0", "z"], label: "Fit image to screen" },
  "image.zoomActual": { scope: "image", keys: ["Mod+1"], label: "Zoom to 100%" },
  // Held, not pressed: the stage pans while Space is down. Listed so the sheet shows it.
  "image.pan": { scope: "image", keys: ["Space"], label: "Hold and drag to pan" },
  "image.duplicate": {
    scope: "image",
    keys: ["Mod+D"],
    label: "Duplicate selected drawing or image",
  },
  "image.bringForward": { scope: "image", keys: ["Mod+]"], label: "Bring selection forward" },
  "image.sendBackward": { scope: "image", keys: ["Mod+["], label: "Send selection backward" },
  "image.deleteRedaction": {
    scope: "image",
    keys: ["Backspace", "Delete"],
    label: "Delete selected drawing or box",
  },
  "image.nudge": {
    scope: "image",
    keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
    // The image editor also takes Shift+arrow for 10px steps.
    label: "Nudge crop, box or drawing (Shift: 10px)",
  },

  "video.playPause": { scope: "video", keys: ["Space"], label: "Play or pause" },
  "video.split": { scope: "video", keys: ["1", "s"], label: "Split at playhead" },
  "video.cutSegment": {
    scope: "video",
    keys: ["2", "x", "Backspace"],
    label: "Cut or restore segment",
  },
  "video.trimTool": { scope: "video", keys: ["3"], label: "Trim options" },
  "video.inPoint": { scope: "video", keys: ["i"], label: "Set in point" },
  "video.outPoint": { scope: "video", keys: ["o"], label: "Set out point" },
  "video.cropToggle": { scope: "video", keys: ["4", "c"], label: "Crop and transform" },
  "video.speedTool": { scope: "video", keys: ["5"], label: "Speed" },
  "video.audioTool": { scope: "video", keys: ["6"], label: "Audio controls" },
  "video.mute": { scope: "video", keys: ["m"], label: "Mute audio" },
  "video.rotate": { scope: "video", keys: ["r"], label: "Rotate 90°" },
  "video.flip": { scope: "video", keys: ["f"], label: "Flip horizontally" },
  "video.shuttleBack": { scope: "video", keys: ["j"], label: "Shuttle backward" },
  "video.shuttlePause": { scope: "video", keys: ["k"], label: "Pause shuttle" },
  "video.shuttleForward": { scope: "video", keys: ["l"], label: "Shuttle forward" },
  "video.stepBack": { scope: "video", keys: ["ArrowLeft"], label: "Previous frame" },
  "video.stepForward": { scope: "video", keys: ["ArrowRight"], label: "Next frame" },
} as const satisfies Record<string, KeybindDefinition>;

export type KeybindAction = keyof typeof KEYBIND_CATALOG;

export type KeybindEntry = {
  readonly action: KeybindAction;
  readonly scope: KeybindScope;
  readonly keys: readonly KeyCombo[];
  readonly label: string;
};

function isKeybindAction(value: string): value is KeybindAction {
  return Object.hasOwn(KEYBIND_CATALOG, value);
}

/** Catalog entries in declaration order, for rendering the shortcut sheet. */
export const KEYBIND_ENTRIES: readonly KeybindEntry[] = Object.entries(KEYBIND_CATALOG).flatMap(
  ([action, def]): KeybindEntry[] =>
    isKeybindAction(action) ? [{ action, scope: def.scope, keys: def.keys, label: def.label }] : [],
);

export function keybindsForScope(scope: KeybindScope): readonly KeybindEntry[] {
  return KEYBIND_ENTRIES.filter((entry) => entry.scope === scope);
}

/** The subset of `KeyboardEvent` used for matching. */
export type KeyInput = {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
};

type ParsedCombo = {
  readonly key: string;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
};

export function parseKeyCombo(combo: KeyCombo): ParsedCombo {
  const parts = combo.split("+");
  // A trailing empty part means the key itself is "+".
  const rawKey = parts.at(-1) === "" ? "+" : (parts.at(-1) ?? "");
  const modifiers = new Set(parts.slice(0, -1));
  return {
    key: rawKey === "Space" ? " " : rawKey,
    mod: modifiers.has("Mod"),
    shift: modifiers.has("Shift"),
    alt: modifiers.has("Alt"),
  };
}

const isLetter = (key: string): boolean => key.length === 1 && /[a-z]/i.test(key);

/**
 * Shift is checked for letters and named keys. For punctuation such as `?`, `[` and `]` the
 * produced character already reflects Shift and the keyboard layout, so Shift is ignored.
 */
export function comboMatches(combo: KeyCombo, input: KeyInput): boolean {
  const parsed = parseKeyCombo(combo);
  const mod = input.metaKey || input.ctrlKey;
  if (parsed.mod !== mod) return false;
  if (parsed.alt !== input.altKey) return false;
  const single = parsed.key.length === 1;
  if (single && isLetter(parsed.key)) {
    if (input.key.toLowerCase() !== parsed.key.toLowerCase()) return false;
    return parsed.shift === input.shiftKey;
  }
  if (input.key !== parsed.key) return false;
  if (single && parsed.key !== " ") return true;
  return parsed.shift === input.shiftKey;
}

/**
 * Resolves a key press to an action. The media scope wins over global bindings so editor
 * keys stay predictable; returns null when nothing matches.
 */
export function matchKeybind(input: KeyInput, scope: KeybindScope | null): KeybindAction | null {
  const scopes: readonly KeybindScope[] =
    scope === null || scope === "global" ? ["global"] : [scope, "global"];
  for (const s of scopes) {
    const hit = KEYBIND_ENTRIES.find(
      (entry) => entry.scope === s && entry.keys.some((combo) => comboMatches(combo, input)),
    );
    if (hit !== undefined) return hit.action;
  }
  return null;
}

/** Display tokens for one combo, e.g. `Mod+Shift+Z` → `["⌘", "⇧", "Z"]` on macOS. */
export function formatKeyCombo(combo: KeyCombo, platform: "mac" | "other"): readonly string[] {
  const parsed = parseKeyCombo(combo);
  const tokens: string[] = [];
  if (parsed.mod) tokens.push(platform === "mac" ? "⌘" : "Ctrl");
  if (parsed.alt) tokens.push(platform === "mac" ? "⌥" : "Alt");
  if (parsed.shift) tokens.push(platform === "mac" ? "⇧" : "Shift");
  tokens.push(
    KEY_LABELS[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key),
  );
  return tokens;
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  " ": "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Backspace: "⌫",
  Delete: "Del",
  Escape: "Esc",
};
