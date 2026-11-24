import { describe, expect, it } from "vitest";
import {
  dismissStarPrompt,
  isDismissedValue,
  parseVisitState,
  recordVisit,
  STAR_PROMPT_KEY,
  VISIT_COUNTED_KEY,
  type KeyValueStore,
  type StarPromptStores,
} from "../src/lib/star-prompt";

/** An in-memory store; `failOn` makes reads, writes or both throw like blocked site data. */
class FakeStore implements KeyValueStore {
  readonly entries = new Map<string, string>();
  failOn: "none" | "read" | "write" | "both" = "none";

  getItem(key: string): string | null {
    if (this.failOn === "read" || this.failOn === "both") {
      throw new DOMException("The operation is insecure.", "SecurityError");
    }
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failOn === "write" || this.failOn === "both") {
      throw new DOMException("Quota exceeded.", "QuotaExceededError");
    }
    this.entries.set(key, value);
  }
}

/** One browser profile: `localStorage` lasts, each new session gets an empty `sessionStorage`. */
function browser() {
  const local = new FakeStore();
  let session = new FakeStore();
  return {
    local,
    get session() {
      return session;
    },
    stores(): StarPromptStores {
      return { local, session };
    },
    newSession() {
      session = new FakeStore();
    },
    stored() {
      return parseVisitState(local.entries.get(STAR_PROMPT_KEY) ?? null);
    },
  };
}

describe("recordVisit", () => {
  it("hides the prompt on the first visit", () => {
    const b = browser();
    expect(recordVisit(b.stores())).toBe(false);
    expect(b.stored()).toEqual({ visits: 1, dismissed: false });
    expect(b.session.entries.get(VISIT_COUNTED_KEY)).toBe("1");
  });

  it("counts reloads in the same session as one visit", () => {
    const b = browser();
    recordVisit(b.stores());
    expect(recordVisit(b.stores())).toBe(false);
    expect(recordVisit(b.stores())).toBe(false);
    expect(b.stored().visits).toBe(1);
  });

  it("shows the prompt on the second session", () => {
    const b = browser();
    recordVisit(b.stores());
    b.newSession();
    expect(recordVisit(b.stores())).toBe(true);
    expect(b.stored()).toEqual({ visits: 2, dismissed: false });
  });

  it("stays at one visit and hidden when StrictMode calls it twice on the first visit", () => {
    const b = browser();
    const first = recordVisit(b.stores());
    const second = recordVisit(b.stores());
    expect([first, second]).toEqual([false, false]);
    expect(b.stored().visits).toBe(1);
  });

  it("stays at two visits and shown when StrictMode calls it twice on the second visit", () => {
    const b = browser();
    recordVisit(b.stores());
    b.newSession();
    const first = recordVisit(b.stores());
    const second = recordVisit(b.stores());
    expect([first, second]).toEqual([true, true]);
    expect(b.stored().visits).toBe(2);
  });

  it("keeps showing on later visits until dismissed", () => {
    const b = browser();
    recordVisit(b.stores());
    b.newSession();
    recordVisit(b.stores());
    b.newSession();
    expect(recordVisit(b.stores())).toBe(true);
    expect(b.stored().visits).toBe(3);
  });
});

describe("dismissStarPrompt", () => {
  it("keeps the prompt hidden on the third visit and preserves the count", () => {
    const b = browser();
    recordVisit(b.stores());
    b.newSession();
    expect(recordVisit(b.stores())).toBe(true);
    dismissStarPrompt(b.stores());
    expect(b.stored()).toEqual({ visits: 2, dismissed: true });
    // The same session no longer shows it either (StrictMode remount, reload).
    expect(recordVisit(b.stores())).toBe(false);
    b.newSession();
    expect(recordVisit(b.stores())).toBe(false);
    expect(b.stored()).toEqual({ visits: 3, dismissed: true });
  });

  it("works before any visit was recorded", () => {
    const b = browser();
    dismissStarPrompt(b.stores());
    expect(b.stored()).toEqual({ visits: 0, dismissed: true });
  });

  it("does not throw when localStorage is blocked", () => {
    const b = browser();
    b.local.failOn = "both";
    expect(() => dismissStarPrompt(b.stores())).not.toThrow();
  });
});

describe("corrupt state", () => {
  it.each([
    ["not json", "{visits: 2"],
    ["a number", "7"],
    ["null", "null"],
    ["an array", "[2, false]"],
    ["wrong field types", JSON.stringify({ visits: "2", dismissed: "no" })],
    ["a missing field", JSON.stringify({ visits: 5 })],
  ])("starts over from %s without throwing", (_label, raw) => {
    const b = browser();
    b.local.entries.set(STAR_PROMPT_KEY, raw);
    expect(() => recordVisit(b.stores())).not.toThrow();
    expect(b.stored()).toEqual({ visits: 1, dismissed: false });
  });

  it("floors fractional and negative counts", () => {
    expect(parseVisitState(JSON.stringify({ visits: 2.7, dismissed: false }))).toEqual({
      visits: 2,
      dismissed: false,
    });
    expect(parseVisitState(JSON.stringify({ visits: -4, dismissed: true }))).toEqual({
      visits: 0,
      dismissed: true,
    });
  });
});

describe("blocked storage", () => {
  it.each(["read", "write", "both"] as const)(
    "hides the prompt when localStorage fails on %s",
    (failOn) => {
      const b = browser();
      b.local.entries.set(STAR_PROMPT_KEY, JSON.stringify({ visits: 5, dismissed: false }));
      b.local.failOn = failOn;
      expect(recordVisit(b.stores())).toBe(false);
    },
  );

  it.each(["read", "write", "both"] as const)(
    "hides the prompt when sessionStorage fails on %s",
    (failOn) => {
      const b = browser();
      b.local.entries.set(STAR_PROMPT_KEY, JSON.stringify({ visits: 5, dismissed: false }));
      b.session.failOn = failOn;
      expect(recordVisit(b.stores())).toBe(false);
    },
  );

  it("does not count a visit when the session marker can't be written", () => {
    const b = browser();
    b.session.failOn = "write";
    recordVisit(b.stores());
    recordVisit(b.stores());
    expect(b.local.entries.has(STAR_PROMPT_KEY)).toBe(false);
  });

  it("stays hidden across reloads and rolls back the session marker when localStorage.setItem throws", () => {
    const b = browser();
    b.local.entries.set(STAR_PROMPT_KEY, JSON.stringify({ visits: 2, dismissed: false }));
    b.local.failOn = "write";
    expect(recordVisit(b.stores())).toBe(false);
    expect(b.session.entries.get(VISIT_COUNTED_KEY)).not.toBe("1");
    expect(recordVisit(b.stores())).toBe(false);
    // Even if the session marker was already set before localStorage ran out of quota:
    b.session.entries.set(VISIT_COUNTED_KEY, "1");
    expect(recordVisit(b.stores())).toBe(false);
  });

  it("hides the prompt when there is no browser storage at all", () => {
    // Vitest runs in Node, where `window` does not exist; the default stores throw.
    expect(recordVisit()).toBe(false);
    expect(() => dismissStarPrompt()).not.toThrow();
  });
});

describe("isDismissedValue", () => {
  it("reads another tab's write", () => {
    expect(isDismissedValue(JSON.stringify({ visits: 2, dismissed: true }))).toBe(true);
    expect(isDismissedValue(JSON.stringify({ visits: 2, dismissed: false }))).toBe(false);
    expect(isDismissedValue(null)).toBe(false);
    expect(isDismissedValue("garbage")).toBe(false);
  });
});
