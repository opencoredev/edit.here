import { describe, expect, it } from "vitest";
import {
  formatRelativeTime,
  MAX_RECENT_PROJECTS,
  oldestRecent,
  recentToPrune,
  sortRecent,
} from "../src/index";

const entries = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `p${i}`, updatedAt: 1000 + i }));

describe("recent projects", () => {
  it("sorts newest first with a stable tie order", () => {
    const sorted = sortRecent([
      { id: "b", updatedAt: 5 },
      { id: "a", updatedAt: 5 },
      { id: "c", updatedAt: 9 },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the newest projects up to the limit", () => {
    expect(
      recentToPrune({ entries: entries(MAX_RECENT_PROJECTS), max: MAX_RECENT_PROJECTS }),
    ).toEqual([]);
    expect(recentToPrune({ entries: entries(14), max: MAX_RECENT_PROJECTS })).toEqual(["p1", "p0"]);
  });

  it("never prunes the project just saved, even when it is the oldest", () => {
    const pruned = recentToPrune({ entries: entries(13), max: 12, keep: "p0" });
    expect(pruned).toEqual(["p1"]);
    expect(recentToPrune({ entries: entries(3), max: 0, keep: "p1" })).toEqual(["p2", "p0"]);
  });

  it("finds the oldest other project to free space", () => {
    expect(oldestRecent({ entries: entries(3), keep: "p0" })).toBe("p1");
    expect(oldestRecent({ entries: entries(3) })).toBe("p0");
    expect(oldestRecent({ entries: entries(1), keep: "p0" })).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date(2026, 10, 23, 12, 0, 0).getTime();
  it.each([
    [0, "Just now"],
    [59_000, "Just now"],
    [-5_000, "Just now"],
    [2 * 60_000, "2m ago"],
    [59 * 60_000, "59m ago"],
    [60 * 60_000, "1h ago"],
    [23 * 3_600_000, "23h ago"],
    [3 * 86_400_000, "3d ago"],
  ])("%d ms ago reads %s", (elapsed, expected) => {
    expect(formatRelativeTime({ time: now - elapsed, now })).toBe(expected);
  });

  it("shows the date after a week, with the year when it differs", () => {
    expect(formatRelativeTime({ time: new Date(2026, 2, 4).getTime(), now })).toBe("Mar 4");
    expect(formatRelativeTime({ time: new Date(2025, 11, 31).getTime(), now })).toBe(
      "Dec 31, 2025",
    );
  });
});
