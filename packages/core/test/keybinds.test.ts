import { describe, expect, it } from "vitest";
import {
  comboMatches,
  formatKeyCombo,
  KEYBIND_CATALOG,
  KEYBIND_ENTRIES,
  keybindsForScope,
  matchKeybind,
  parseKeyCombo,
  type KeyInput,
} from "../src/index";

const press = (key: string, mods: Partial<Omit<KeyInput, "key">> = {}): KeyInput => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("keybind catalog", () => {
  it("lists every catalog entry once", () => {
    expect(KEYBIND_ENTRIES).toHaveLength(Object.keys(KEYBIND_CATALOG).length);
    expect(keybindsForScope("video").every((e) => e.scope === "video")).toBe(true);
  });

  it("has no conflicting combos inside one scope", () => {
    for (const scope of ["global", "image", "video"] as const) {
      const combos = keybindsForScope(scope).flatMap((e) => e.keys);
      expect(new Set(combos).size).toBe(combos.length);
    }
  });

  it("parses combos", () => {
    expect(parseKeyCombo("Mod+Shift+Z")).toEqual({ key: "Z", mod: true, shift: true, alt: false });
    expect(parseKeyCombo("Space").key).toBe(" ");
    expect(parseKeyCombo("Mod++").key).toBe("+");
  });
});

describe("matchKeybind", () => {
  it("matches global shortcuts with Cmd or Ctrl", () => {
    expect(matchKeybind(press("z", { metaKey: true }), null)).toBe("global.undo");
    expect(matchKeybind(press("z", { ctrlKey: true }), "image")).toBe("global.undo");
    expect(matchKeybind(press("Z", { metaKey: true, shiftKey: true }), "video")).toBe(
      "global.redo",
    );
    expect(matchKeybind(press("y", { ctrlKey: true }), "video")).toBe("global.redo");
    expect(matchKeybind(press("e", { metaKey: true }), "image")).toBe("global.export");
    expect(matchKeybind(press("c", { metaKey: true }), "image")).toBe("global.copy");
    expect(matchKeybind(press("Escape"), "video")).toBe("global.escape");
  });

  it("matches ? with or without the Shift flag", () => {
    expect(matchKeybind(press("?", { shiftKey: true }), null)).toBe("global.help");
    expect(matchKeybind(press("?"), "video")).toBe("global.help");
  });

  it("resolves image tools on 1-9 and their letter aliases", () => {
    const cases: Array<[string, string, string]> = [
      ["1", "v", "image.select"],
      ["2", "p", "image.pen"],
      ["3", "h", "image.highlighter"],
      ["4", "a", "image.arrow"],
      ["5", "u", "image.rectangle"],
      ["6", "x", "image.text"],
      ["7", "r", "image.redact"],
      ["8", "c", "image.crop"],
      ["9", "b", "image.frame"],
    ];
    for (const [digit, letter, action] of cases) {
      expect(matchKeybind(press(digit), "image")).toBe(action);
      expect(matchKeybind(press(letter), "image")).toBe(action);
    }
  });

  it("resolves other image commands", () => {
    const cases: Array<[KeyInput, string]> = [
      [press("t"), "image.transparent"],
      [press("R", { shiftKey: true }), "image.rotate"],
      [press("]"), "image.rotate"],
      [press("f"), "image.flip"],
      [press("0"), "image.reset"],
      [press("Backspace"), "image.deleteRedaction"],
      [press("Delete"), "image.deleteRedaction"],
      [press(" "), "image.pan"],
    ];
    for (const [input, action] of cases) expect(matchKeybind(input, "image")).toBe(action);
  });

  it("resolves image zoom shortcuts", () => {
    expect(matchKeybind(press("="), "image")).toBe("image.zoomIn");
    expect(matchKeybind(press("+", { shiftKey: true }), "image")).toBe("image.zoomIn");
    expect(matchKeybind(press("-"), "image")).toBe("image.zoomOut");
    expect(matchKeybind(press("0", { metaKey: true }), "image")).toBe("image.zoomReset");
    expect(matchKeybind(press("0", { ctrlKey: true }), "image")).toBe("image.zoomReset");
    expect(matchKeybind(press("z"), "image")).toBe("image.zoomReset");
    expect(matchKeybind(press("1", { metaKey: true }), "image")).toBe("image.zoomActual");
    // Mod+Z stays undo, not fit.
    expect(matchKeybind(press("z", { metaKey: true }), "image")).toBe("global.undo");
  });

  it("resolves video controls", () => {
    const cases: Array<[string, string]> = [
      [" ", "video.playPause"],
      ["i", "video.inPoint"],
      ["o", "video.outPoint"],
      ["1", "video.split"],
      ["s", "video.split"],
      ["2", "video.cutSegment"],
      ["x", "video.cutSegment"],
      ["3", "video.trimTool"],
      ["4", "video.cropToggle"],
      ["5", "video.speedTool"],
      ["6", "video.audioTool"],
      ["r", "video.rotate"],
      ["f", "video.flip"],
      ["Backspace", "video.cutSegment"],
      ["c", "video.cropToggle"],
      ["m", "video.mute"],
      ["j", "video.shuttleBack"],
      ["k", "video.shuttlePause"],
      ["l", "video.shuttleForward"],
      ["ArrowLeft", "video.stepBack"],
      ["ArrowRight", "video.stepForward"],
    ];
    for (const [key, action] of cases) expect(matchKeybind(press(key), "video")).toBe(action);
  });

  it("does not fire bare-letter tools when a modifier is held", () => {
    expect(matchKeybind(press("r", { metaKey: true }), "image")).toBeNull();
    expect(matchKeybind(press("P", { shiftKey: true }), "image")).toBeNull();
    expect(matchKeybind(press("2", { metaKey: true }), "image")).toBeNull();
    expect(matchKeybind(press("c", { altKey: true }), "image")).toBeNull();
  });

  it("does not leak media keys into other scopes", () => {
    expect(matchKeybind(press("s"), "image")).toBeNull();
    expect(matchKeybind(press("8"), "video")).toBeNull();
    expect(matchKeybind(press("c"), null)).toBeNull();
    expect(matchKeybind(press("t"), "global")).toBeNull();
  });

  it("requires Shift to match exactly for named keys", () => {
    expect(comboMatches("Space", press(" ", { shiftKey: true }))).toBe(false);
    expect(comboMatches("ArrowLeft", press("ArrowLeft", { shiftKey: true }))).toBe(false);
  });
});

describe("formatKeyCombo", () => {
  it("formats for macOS and other platforms", () => {
    expect(formatKeyCombo("Mod+Shift+Z", "mac")).toEqual(["⌘", "⇧", "Z"]);
    expect(formatKeyCombo("Mod+Shift+Z", "other")).toEqual(["Ctrl", "Shift", "Z"]);
    expect(formatKeyCombo("Space", "mac")).toEqual(["Space"]);
    expect(formatKeyCombo("ArrowLeft", "other")).toEqual(["←"]);
    expect(formatKeyCombo("?", "mac")).toEqual(["?"]);
  });
});
