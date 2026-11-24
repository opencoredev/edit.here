import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../src/index";

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const h = createHistory(1);
    expect(h).toEqual({ past: [], present: 1, future: [] });
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });

  it("pushes, undoes and redoes in order", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "c");
    expect(h.past).toEqual(["a", "b"]);
    h = undoHistory(h);
    expect(h.present).toBe("b");
    expect(h.future).toEqual(["c"]);
    h = undoHistory(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    h = redoHistory(h);
    h = redoHistory(h);
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
  });

  it("drops the redo stack on a new push", () => {
    let h = pushHistory(pushHistory(createHistory(0), 1), 2);
    h = undoHistory(h);
    h = pushHistory(h, 9);
    expect(h).toEqual({ past: [0, 1], present: 9, future: [] });
  });

  it("ignores pushing the identical present", () => {
    const state = { n: 1 };
    const h = createHistory(state);
    expect(pushHistory(h, state)).toBe(h);
  });

  it("returns the same stack when undo or redo has nothing to do", () => {
    const h = createHistory(1);
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });

  it("caps the past at the limit", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
    expect(h.present).toBe(10);
  });
});
