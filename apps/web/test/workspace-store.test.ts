import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "../src/lib/workspace-store";
import {
  inTab,
  limitBlobQuota,
  MemoryStorage,
  openTab,
  resetDatabase,
  type Tab,
} from "./idb-harness";

let clock = 1_000;

function record(args: {
  readonly id: string;
  readonly bytes?: number;
  readonly state?: unknown;
  readonly kind?: "image" | "video";
  readonly file?: File;
}): WorkspaceRecord {
  const kind = args.kind ?? "image";
  const name = kind === "video" ? `${args.id}.mp4` : `${args.id}.png`;
  const type = kind === "video" ? "video/mp4" : "image/png";
  const file = args.file ?? new File([new Uint8Array(args.bytes ?? 16).fill(7)], name, { type });
  clock += 1;
  return {
    id: args.id,
    meta: { id: args.id, name, mimeType: type, size: file.size, kind },
    file,
    fileName: name,
    fileType: type,
    state: args.state ?? null,
    extraFiles: [],
    updatedAt: clock,
  };
}

/** A file that reports `size` bytes without holding them; a save over the limit never reads it. */
function sizedFile(id: string, size: number): File {
  const file = new File([new Uint8Array(16)], `${id}.png`, { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/**
 * Starts `work` as `other` while `current` is in the middle of something, then hands
 * sessionStorage back to `current`. The store reads sessionStorage only synchronously.
 */
function meanwhile<T>(other: Tab, current: Tab, work: (store: Tab["store"]) => Promise<T>) {
  const started = inTab(other, work);
  vi.stubGlobal("sessionStorage", current.session);
  return started;
}

/** Patches a stored header directly in IndexedDB to simulate a pre-`writeId` revision. */
function patchLegacyHeader(id: string, mutate: (header: Record<string, unknown>) => void) {
  return new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("edit-here-db", 2);
    open.addEventListener("error", () => reject(open.error));
    open.addEventListener("success", () => {
      const db = open.result;
      const tx = db.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      const req = store.get(id);
      req.addEventListener("success", () => {
        const header = { ...(req.result as Record<string, unknown>) };
        delete header["writeId"];
        mutate(header);
        store.put(header, id);
      });
      tx.addEventListener("complete", () => {
        db.close();
        resolve();
      });
      tx.addEventListener("error", () => reject(tx.error));
    });
  });
}

/** Counts every raw record in the `projects` object store, including hidden legacy entries. */
function rawProjectCount(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const open = indexedDB.open("edit-here-db", 2);
    open.addEventListener("error", () => reject(open.error));
    open.addEventListener("success", () => {
      const db = open.result;
      const req = db.transaction("projects", "readonly").objectStore("projects").count();
      req.addEventListener("error", () => {
        db.close();
        reject(req.error);
      });
      req.addEventListener("success", () => {
        const count = req.result;
        db.close();
        resolve(count);
      });
    });
  });
}

/** Rewrites a stored header in IndexedDB to look like an old pre-removal PDF project. */
function markLegacyPdf(id: string, bytes: number): Promise<void> {
  return patchLegacyHeader(id, (header) => {
    header["meta"] = {
      id,
      name: `${id}.pdf`,
      mimeType: "application/pdf",
      size: bytes,
      kind: "pdf",
    };
    header["fileName"] = `${id}.pdf`;
    header["fileType"] = "application/pdf";
  });
}

/** Seeds a raw value (including `undefined`) directly under a key in `projects`. */
function putRawProject(id: string, value: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("edit-here-db", 2);
    open.addEventListener("error", () => reject(open.error));
    open.addEventListener("success", () => {
      const db = open.result;
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(value, id);
      tx.addEventListener("complete", () => {
        db.close();
        resolve();
      });
      tx.addEventListener("error", () => {
        db.close();
        reject(tx.error);
      });
    });
  });
}

beforeEach(() => {
  resetDatabase();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a deleted project stays deleted", () => {
  it("does not come back when another tab cleared everything and this tab saves an edit", async () => {
    const a = await openTab();
    const b = await openTab();
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }))).toBe(
      true,
    );
    expect(await inTab(b, (s) => s.loadActiveWorkspace())).not.toBeNull();
    await inTab(b, (s) => s.clearAllWorkspaces());

    const rotated = record({ id: "p", state: { rotation: 90 } });
    expect(await inTab(a, (s) => s.saveWorkspace(rotated, { activate: true }))).toBe(false);
    expect(await inTab(a, (s) => s.listRecentWorkspaces())).toEqual([]);
    expect(await inTab(a, (s) => s.loadWorkspaceById("p"))).toBeNull();
  });

  it("does not come back after another tab deleted it from Home", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }));
    await inTab(b, (s) => s.deleteWorkspaceById("p"));
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }))).toBe(
      false,
    );
    expect(await inTab(b, (s) => s.listRecentWorkspaces())).toEqual([]);
  });

  it("does not come back for a project this tab only restored", async () => {
    const a = await openTab();
    await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }));
    const b = await openTab();
    const c = await openTab();
    expect((await inTab(b, (s) => s.loadActiveWorkspace()))?.id).toBe("p");
    await inTab(c, (s) => s.clearAllWorkspaces());
    expect(await inTab(b, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }))).toBe(
      false,
    );
    expect(await inTab(c, (s) => s.listRecentWorkspaces())).toEqual([]);
  });

  it("does not come back after a save over the size limit, then a small save", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }));
    await inTab(b, (s) => s.clearAllWorkspaces());

    const huge = record({ id: "p", file: sizedFile("p", a.store.MAX_STORED_BYTES + 1) });
    expect(await inTab(a, (s) => s.saveWorkspace(huge, { activate: true }))).toBe(false);
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }))).toBe(
      false,
    );
    expect(await inTab(b, (s) => s.listRecentWorkspaces())).toEqual([]);
  });

  it("drops this tab's own project on a save over the size limit, and saves it afresh after", async () => {
    const a = await openTab();
    await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }));
    const huge = record({ id: "p", file: sizedFile("p", a.store.MAX_STORED_BYTES + 1) });
    expect(await inTab(a, (s) => s.saveWorkspace(huge, { activate: true }))).toBe(false);
    expect(await inTab(a, (s) => s.listRecentWorkspaces())).toEqual([]);
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }))).toBe(
      true,
    );
    const ids = (await inTab(await openTab(), (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids).toEqual(["p"]);
  });

  it("still saves a file opened after Clear all", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(a, (s) => s.saveWorkspace(record({ id: "p" }), { activate: true }));
    await inTab(b, (s) => s.clearAllWorkspaces());
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "q" }), { activate: true }))).toBe(
      true,
    );
    expect(await inTab(a, (s) => s.saveWorkspace(record({ id: "q" }), { activate: true }))).toBe(
      true,
    );
    const ids = (await inTab(b, (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids).toEqual(["q"]);
  });
});

describe("a PDF project saved by an earlier build", () => {
  it("is left out of the list and never reopened", async () => {
    const seed = await openTab();
    await inTab(seed, (s) => s.saveWorkspace(record({ id: "kept" }), { activate: false }));
    await inTab(seed, (s) => s.saveWorkspace(record({ id: "old-pdf" }), { activate: true }));
    // Rewrite the active project's header as an earlier build stored a PDF.
    await patchLegacyHeader("old-pdf", (h) => {
      h["meta"] = {
        id: "old-pdf",
        name: "old-pdf.pdf",
        mimeType: "application/pdf",
        size: 16,
        kind: "pdf",
      };
      h["fileName"] = "old-pdf.pdf";
      h["fileType"] = "application/pdf";
    });

    const tab = await openTab();
    expect(await inTab(tab, (s) => s.loadActiveWorkspace())).toBeNull();
    expect(await inTab(tab, (s) => s.loadWorkspaceById("old-pdf"))).toBeNull();
    const ids = (await inTab(tab, (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids).toEqual(["kept"]);
    // The store keeps working around it.
    expect(
      await inTab(tab, (s) => s.saveWorkspace(record({ id: "new" }), { activate: true })),
    ).toBe(true);
    expect((await inTab(await openTab(), (s) => s.loadActiveWorkspace()))?.id).toBe("new");
  });
});

describe("a tab that auto-restored a project", () => {
  it("reopens that project on reload after another tab opened something else", async () => {
    const tab1 = await openTab();
    await inTab(tab1, (s) => s.saveWorkspace(record({ id: "image" }), { activate: true }));
    const session2 = new MemoryStorage();
    const tab2 = await openTab(session2);
    expect((await inTab(tab2, (s) => s.loadActiveWorkspace()))?.id).toBe("image");

    await inTab(tab1, (s) =>
      s.saveWorkspace(record({ id: "doc", kind: "video" }), { activate: true }),
    );
    const reloaded = await openTab(session2);
    expect((await inTab(reloaded, (s) => s.loadActiveWorkspace()))?.id).toBe("image");
    // A brand-new tab still follows the last tab to edit.
    expect((await inTab(await openTab(), (s) => s.loadActiveWorkspace()))?.id).toBe("doc");
  });
});

describe("queued saves of one project", () => {
  it("write the newest edit, and every caller hears it was saved", async () => {
    const tab = await openTab();
    const saves = await inTab(tab, (s) =>
      Promise.all(
        [1, 2, 3].map((n) =>
          s.saveWorkspace(record({ id: "p", state: { n } }), { activate: true }),
        ),
      ),
    );
    expect(saves).toEqual([true, true, true]);
    const fresh = await openTab();
    expect((await inTab(fresh, (s) => s.loadWorkspaceById("p")))?.state).toEqual({ n: 3 });
  });
});

describe("running out of quota", () => {
  let quota: ReturnType<typeof limitBlobQuota> | null = null;
  afterEach(() => {
    quota?.restore();
    quota = null;
  });

  it("keeps every other project when even evicting them all can't fit the save", async () => {
    quota = limitBlobQuota(1_000_000);
    const tab = await openTab();
    await inTab(tab, async (s) => {
      expect(await s.saveWorkspace(record({ id: "a", bytes: 80_000 }), { activate: true })).toBe(
        true,
      );
      expect(await s.saveWorkspace(record({ id: "b", bytes: 80_000 }), { activate: true })).toBe(
        true,
      );
      expect(
        await s.saveWorkspace(record({ id: "big", bytes: 1_200_000 }), { activate: true }),
      ).toBe(false);
    });
    expect(quota.used()).toBe(160_000);
    const fresh = await openTab();
    const ids = (await inTab(fresh, (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids.toSorted()).toEqual(["a", "b"]);
    for (const id of ["a", "b"]) {
      const restored = await inTab(fresh, (s) => s.loadWorkspaceById(id));
      expect(restored?.file.size).toBe(80_000);
      expect(new Uint8Array(await restored!.file.arrayBuffer())[0]).toBe(7);
    }
  });

  it("drops only the oldest projects it needs to when the save then fits", async () => {
    quota = limitBlobQuota(200_000);
    const tab = await openTab();
    await inTab(tab, async (s) => {
      await s.saveWorkspace(record({ id: "a", bytes: 80_000 }), { activate: true });
      await s.saveWorkspace(record({ id: "b", bytes: 80_000 }), { activate: true });
      expect(await s.saveWorkspace(record({ id: "c", bytes: 100_000 }), { activate: true })).toBe(
        true,
      );
    });
    const ids = (await inTab(await openTab(), (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids).toEqual(["c", "b"]);
  });

  it("does not put back evicted projects after another tab cleared everything", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(b, (s) => s.listRecentWorkspaces());
    let cleared: Promise<void> | null = null;
    quota = limitBlobQuota(200_000, {
      // The second failure comes after the save evicted "old" and before it gives up.
      onQuotaExceeded: (count) => {
        if (count === 2) cleared = meanwhile(b, a, (s) => s.clearAllWorkspaces());
      },
    });
    await inTab(a, async (s) => {
      await s.saveWorkspace(record({ id: "old", bytes: 80_000 }), { activate: true });
      await s.saveWorkspace(record({ id: "mid", bytes: 80_000 }), { activate: true });
      expect(await s.saveWorkspace(record({ id: "big", bytes: 250_000 }), { activate: true })).toBe(
        false,
      );
    });
    expect(cleared).not.toBeNull();
    await cleared;
    expect(await inTab(await openTab(), (s) => s.listRecentWorkspaces())).toEqual([]);
    expect(quota.used()).toBe(0);
  });

  it("does not delete another tab's newer revision when its own save of it fails", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(b, (s) => s.listRecentWorkspaces());
    let bSaved: Promise<boolean> | null = null;
    quota = limitBlobQuota(300_000, {
      // While this tab retries "p", the other tab saves a bigger edit of it that fits.
      onQuotaExceeded: (count) => {
        if (count === 1) {
          bSaved = meanwhile(b, a, (s) =>
            s.saveWorkspace(record({ id: "p", bytes: 120_000, state: "b" }), { activate: true }),
          );
        }
      },
    });
    await inTab(a, async (s) => {
      await s.saveWorkspace(record({ id: "p", bytes: 50_000 }), { activate: true });
      await s.saveWorkspace(record({ id: "q", bytes: 60_000 }), { activate: true });
      expect(
        await s.saveWorkspace(record({ id: "p", bytes: 400_000, state: "a" }), { activate: true }),
      ).toBe(false);
    });
    expect(bSaved).not.toBeNull();
    expect(await bSaved).toBe(true);
    const fresh = await openTab();
    const ids = (await inTab(fresh, (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids.toSorted()).toEqual(["p", "q"]);
    const p = await inTab(fresh, (s) => s.loadWorkspaceById("p"));
    expect(p?.state).toBe("b");
    expect(p?.file.size).toBe(120_000);
  });

  it("does not delete another tab's revision saved before this tab's save failed", async () => {
    quota = limitBlobQuota(300_000);
    const a = await openTab();
    const b = await openTab();
    await inTab(a, async (s) => {
      await s.saveWorkspace(record({ id: "p", bytes: 50_000 }), { activate: true });
      await s.saveWorkspace(record({ id: "q", bytes: 60_000 }), { activate: true });
    });
    await inTab(b, (s) =>
      s.saveWorkspace(record({ id: "p", bytes: 120_000, state: "b" }), { activate: true }),
    );
    expect(
      await inTab(a, (s) =>
        s.saveWorkspace(record({ id: "p", bytes: 400_000, state: "a" }), { activate: true }),
      ),
    ).toBe(false);
    const fresh = await openTab();
    expect((await inTab(fresh, (s) => s.loadWorkspaceById("p")))?.state).toBe("b");
    expect((await inTab(fresh, (s) => s.loadWorkspaceById("q")))?.file.size).toBe(60_000);
  });

  it("does not put back an evicted project after another tab explicitly deleted it", async () => {
    const a = await openTab();
    const b = await openTab();
    await inTab(b, (s) => s.listRecentWorkspaces());
    let deleted: Promise<void> | null = null;
    quota = limitBlobQuota(200_000, {
      // The second failure comes after the save evicted "old" and before it gives up.
      onQuotaExceeded: (count) => {
        if (count === 2) deleted = meanwhile(b, a, (s) => s.deleteWorkspaceById("old"));
      },
    });
    await inTab(a, async (s) => {
      await s.saveWorkspace(record({ id: "old", bytes: 80_000 }), { activate: true });
      await s.saveWorkspace(record({ id: "mid", bytes: 80_000 }), { activate: true });
      expect(await s.saveWorkspace(record({ id: "big", bytes: 250_000 }), { activate: true })).toBe(
        false,
      );
    });
    expect(deleted).not.toBeNull();
    await deleted;
    const ids = (await inTab(await openTab(), (s) => s.listRecentWorkspaces())).map((r) => r.id);
    expect(ids).toEqual(["mid"]);
  });

  it("drops a restored pre-writeId project when an over-limit save fails", async () => {
    const seed = await openTab();
    await inTab(seed, (s) =>
      s.saveWorkspace(record({ id: "legacy", kind: "video", state: { v: 1 } }), { activate: true }),
    );
    // Strip `writeId` directly in IndexedDB to simulate a project saved before `writeId` existed.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("edit-here-db", 2);
      open.addEventListener("error", () => reject(open.error));
      open.addEventListener("success", () => {
        const db = open.result;
        const tx = db.transaction("projects", "readwrite");
        const store = tx.objectStore("projects");
        const req = store.get("legacy");
        req.addEventListener("success", () => {
          const header = { ...(req.result as Record<string, unknown>) };
          delete header["writeId"];
          store.put(header, "legacy");
        });
        tx.addEventListener("complete", () => {
          db.close();
          resolve();
        });
        tx.addEventListener("error", () => reject(tx.error));
      });
    });

    const a = await openTab();
    const restored = await inTab(a, (s) => s.loadActiveWorkspace());
    expect(restored?.id).toBe("legacy");
    const over = record({
      id: "legacy",
      kind: "video",
      file: sizedFile("legacy", 200 * 1024 * 1024 + 1),
      state: { v: 2 },
    });
    expect(await inTab(a, (s) => s.saveWorkspace(over, { activate: true }))).toBe(false);
    expect(await inTab(await openTab(), (s) => s.loadWorkspaceById("legacy"))).toBeNull();
  });

  it("preserves a newer pre-writeId revision saved by an older tab when this tab's save fails", async () => {
    const seed = await openTab();
    await inTab(seed, (s) =>
      s.saveWorkspace(record({ id: "legacy2", kind: "video", state: { v: 1 } }), {
        activate: true,
      }),
    );
    await patchLegacyHeader("legacy2", () => undefined);
    const a = await openTab();
    expect((await inTab(a, (s) => s.loadActiveWorkspace()))?.id).toBe("legacy2");

    // Simulate an older pre-writeId tab saving a newer revision before `a`'s over-limit save.
    await patchLegacyHeader("legacy2", (h) => {
      h["state"] = { v: 2 };
      h["updatedAt"] = Number(h["updatedAt"] ?? 0) + 50;
    });

    const over = record({
      id: "legacy2",
      kind: "video",
      file: sizedFile("legacy2", 200 * 1024 * 1024 + 1),
      state: { v: 3 },
    });
    expect(await inTab(a, (s) => s.saveWorkspace(over, { activate: true }))).toBe(false);
    const kept = await inTab(await openTab(), (s) => s.loadWorkspaceById("legacy2"));
    expect(kept?.state).toEqual({ v: 2 });
  });

  it("distinguishes distinct legacy Map states with the same timestamp and tokens", async () => {
    const seed = await openTab();
    await inTab(seed, (s) =>
      s.saveWorkspace(record({ id: "legacy-map", state: new Map([["k", 1]]) }), {
        activate: true,
      }),
    );
    await patchLegacyHeader("legacy-map", () => undefined);
    const a = await openTab();
    expect((await inTab(a, (s) => s.loadActiveWorkspace()))?.id).toBe("legacy-map");

    // Same timestamp and tokens, different Map contents.
    await patchLegacyHeader("legacy-map", (h) => {
      h["state"] = new Map([["k", 2]]);
    });
    const over = record({
      id: "legacy-map",
      file: sizedFile("legacy-map", 200 * 1024 * 1024 + 1),
      state: new Map([["k", 3]]),
    });
    expect(await inTab(a, (s) => s.saveWorkspace(over, { activate: true }))).toBe(false);
    const kept = await inTab(await openTab(), (s) => s.loadWorkspaceById("legacy-map"));
    expect(kept?.state).toEqual(new Map([["k", 2]]));
  });

  it("preserves a newer pre-writeId sparse-array or File revision with identical metadata", async () => {
    const seed = await openTab();
    const fixedTime = 1_700_000_000_000;
    const fileA = new File(["a"], "note.txt", { type: "text/plain", lastModified: fixedTime });
    const fileB = new File(["b"], "note.txt", { type: "text/plain", lastModified: fixedTime });
    await inTab(seed, async (s) => {
      await s.saveWorkspace(record({ id: "legacy-sparse", state: [42] }), { activate: true });
      await s.saveWorkspace(record({ id: "legacy-file", state: fileA }), { activate: true });
    });
    await patchLegacyHeader("legacy-sparse", () => undefined);
    await patchLegacyHeader("legacy-file", () => undefined);

    const a = await openTab();
    expect((await inTab(a, (s) => s.loadWorkspaceById("legacy-sparse")))?.id).toBe("legacy-sparse");
    expect((await inTab(a, (s) => s.loadWorkspaceById("legacy-file")))?.id).toBe("legacy-file");

    // Older pre-writeId tab overwrites both with same timestamp/tokens and sparse array / new File bytes.
    await patchLegacyHeader("legacy-sparse", (h) => {
      const sparse: unknown[] = [];
      sparse.length = 1;
      h["state"] = sparse;
    });
    await patchLegacyHeader("legacy-file", (h) => {
      h["state"] = fileB;
    });

    expect(
      await inTab(a, (s) =>
        s.saveWorkspace(
          record({ id: "legacy-sparse", file: sizedFile("legacy-sparse", 200 * 1024 * 1024 + 1) }),
          { activate: true },
        ),
      ),
    ).toBe(false);
    expect(
      await inTab(a, (s) =>
        s.saveWorkspace(
          record({ id: "legacy-file", file: sizedFile("legacy-file", 200 * 1024 * 1024 + 1) }),
          { activate: true },
        ),
      ),
    ).toBe(false);

    const fresh = await openTab();
    const keptSparse = await inTab(fresh, (s) => s.loadWorkspaceById("legacy-sparse"));
    expect(keptSparse?.id).toBe("legacy-sparse");
    const sparseState = keptSparse?.state;
    expect(Array.isArray(sparseState) && !(0 in sparseState)).toBe(true);

    const keptFile = await inTab(fresh, (s) => s.loadWorkspaceById("legacy-file"));
    expect(keptFile?.id).toBe("legacy-file");
    const fileState = keptFile?.state;
    expect(fileState instanceof File && (await fileState.text()) === "b").toBe(true);
  });

  it("drops a legacy project after thumbnail backfill or in-place state mutation when a save fails", async () => {
    const seed = await openTab();
    await inTab(seed, async (s) => {
      await s.saveWorkspace(record({ id: "legacy-thumb", state: { v: 1 } }), { activate: true });
      await s.saveWorkspace(record({ id: "legacy-mutate", state: { v: 1 } }), { activate: true });
    });
    await patchLegacyHeader("legacy-thumb", (h) => {
      h["thumbnail"] = null;
    });
    await patchLegacyHeader("legacy-mutate", () => undefined);

    const a = await openTab();
    expect((await inTab(a, (s) => s.loadWorkspaceById("legacy-thumb")))?.id).toBe("legacy-thumb");
    await inTab(a, async (s) => {
      s.saveWorkspaceThumbnail("legacy-thumb", Promise.resolve("data:image/png;base64,AA=="));
      await s.listRecentWorkspaces();
    });
    expect(
      await inTab(a, (s) =>
        s.saveWorkspace(
          record({ id: "legacy-thumb", file: sizedFile("legacy-thumb", 200 * 1024 * 1024 + 1) }),
          { activate: true },
        ),
      ),
    ).toBe(false);
    expect(await inTab(await openTab(), (s) => s.loadWorkspaceById("legacy-thumb"))).toBeNull();

    const restored = await inTab(a, (s) => s.loadWorkspaceById("legacy-mutate"));
    expect(restored?.id).toBe("legacy-mutate");
    Object.assign(restored?.state as Record<string, unknown>, { v: 2 });
    expect(
      await inTab(a, (s) =>
        s.saveWorkspace(
          record({
            id: "legacy-mutate",
            file: sizedFile("legacy-mutate", 200 * 1024 * 1024 + 1),
          }),
          { activate: true },
        ),
      ),
    ).toBe(false);
    expect(await inTab(await openTab(), (s) => s.loadWorkspaceById("legacy-mutate"))).toBeNull();
  });

  it("keeps a pre-writeId recent when opening it overlaps another tab's failed quota retry", async () => {
    const id = "legacy-quota-open";
    const opener = await openTab();
    const saver = await openTab();
    await inTab(opener, (s) => s.listRecentWorkspaces());

    let opening: Promise<string | undefined> | undefined;
    let failures = 0;
    quota = limitBlobQuota(128, {
      onQuotaExceeded: (count) => {
        failures = count;
        if (count !== 1) return;
        opening = meanwhile(opener, saver, async (s) => {
          const restored = await s.loadWorkspaceById(id);
          if (restored === null) await s.deleteWorkspaceById(id);
          return restored?.id;
        });
      },
    });

    const extraFiles = Array.from({ length: 3 }, (_, index) => ({
      id: String(index),
      name: "asset.txt",
      type: "text/plain",
      blob: new Blob(["asset"]),
    }));
    const seed = await openTab();
    expect(
      await inTab(seed, (s) =>
        s.saveWorkspace({ ...record({ id, bytes: 16 }), extraFiles }, { activate: true }),
      ),
    ).toBe(true);
    await patchLegacyHeader(id, () => undefined);
    expect(quota.used()).toBe(31);

    expect(
      await inTab(saver, (s) =>
        s.saveWorkspace(record({ id: "oversized-for-quota", bytes: 256 }), { activate: false }),
      ),
    ).toBe(false);
    expect(failures).toBe(2);
    expect(opening).toBeDefined();

    const openedId = await opening;
    const recentIds = (await inTab(await openTab(), (s) => s.listRecentWorkspaces())).map(
      (entry) => entry.id,
    );
    expect({ openedId, recentIds, quotaUsed: quota.used() }).toEqual({
      openedId: id,
      recentIds: [id],
      quotaUsed: 31,
    });
  });

  it("evicts hidden legacy PDF blobs under quota so new images can still save", async () => {
    quota = limitBlobQuota(200_000);
    const seed = await openTab();
    expect(
      await inTab(seed, (s) =>
        s.saveWorkspace(record({ id: "old-pdf", bytes: 180_000 }), { activate: true }),
      ),
    ).toBe(true);
    await markLegacyPdf("old-pdf", 180_000);

    const fresh = await openTab();
    expect(await inTab(fresh, (s) => s.listRecentWorkspaces())).toEqual([]);
    expect(
      await inTab(fresh, (s) =>
        s.saveWorkspace(record({ id: "new-image", bytes: 60_000 }), { activate: true }),
      ),
    ).toBe(true);
    expect(quota.used()).toBe(60_000);
    expect((await inTab(fresh, (s) => s.listRecentWorkspaces())).map((p) => p.id)).toEqual([
      "new-image",
    ]);
    expect(await rawProjectCount()).toBe(1);
  });

  it("prunes hidden legacy PDF records so stored projects never exceed twelve", async () => {
    const tab = await openTab();
    for (let i = 0; i < 12; i += 1) {
      expect(
        await inTab(tab, (s) => s.saveWorkspace(record({ id: `old-${i}` }), { activate: false })),
      ).toBe(true);
    }
    await markLegacyPdf("old-0", 16);
    await markLegacyPdf("old-1", 16);
    for (let i = 0; i < 3; i += 1) {
      expect(
        await inTab(tab, (s) => s.saveWorkspace(record({ id: `new-${i}` }), { activate: false })),
      ).toBe(true);
    }
    expect(await rawProjectCount()).toBe(12);
    expect((await inTab(tab, (s) => s.listRecentWorkspaces())).length).toBe(12);
  });

  it("evicts a project key holding undefined instead of spinning under quota pressure", async () => {
    quota = limitBlobQuota(200_000);
    const tab = await openTab();
    expect(
      await inTab(tab, (s) =>
        s.saveWorkspace(record({ id: "old-image", bytes: 180_000 }), { activate: true }),
      ),
    ).toBe(true);
    await putRawProject("corrupt-undefined", undefined);

    const fresh = await openTab();
    expect(
      await inTab(fresh, (s) =>
        s.saveWorkspace(record({ id: "new-image", bytes: 60_000 }), { activate: true }),
      ),
    ).toBe(true);
    expect(quota.used()).toBe(60_000);
    expect((await inTab(fresh, (s) => s.listRecentWorkspaces())).map((p) => p.id)).toEqual([
      "new-image",
    ]);
    expect(await rawProjectCount()).toBe(1);
  });
});
