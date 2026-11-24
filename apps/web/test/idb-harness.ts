/**
 * Test helpers for the workspace store: a fresh in-memory IndexedDB per test, separate "tabs"
 * (each its own copy of the store module and its own sessionStorage, sharing one database), and
 * an origin quota on the `blobs` store that fails a transaction the way browsers do: the
 * transaction aborts and its `error` is a `QuotaExceededError`.
 */
import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import { vi } from "vitest";

type StoreModule = typeof import("../src/lib/workspace-store");

/** sessionStorage for one tab. */
export class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

export type Tab = { readonly store: StoreModule; readonly session: MemoryStorage };

/** A fresh database for the next tabs. */
export function resetDatabase(): void {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
}

/** A tab: a new copy of the store module. Pass a tab's session to model reloading it. */
export async function openTab(session: MemoryStorage = new MemoryStorage()): Promise<Tab> {
  vi.resetModules();
  const store = await import("../src/lib/workspace-store");
  return { store, session };
}

/** Runs `work` as `tab`. Await it before switching tabs: sessionStorage is a global. */
export function inTab<T>(tab: Tab, work: (store: StoreModule) => Promise<T>): Promise<T> {
  vi.stubGlobal("sessionStorage", tab.session);
  return work(tab.store);
}

// ---------------------------------------------------------------------------
// Quota

type BlobOp =
  | { readonly kind: "put"; readonly key: string; readonly size: number }
  | { readonly kind: "delete"; readonly key: IDBValidKey | IDBKeyRange }
  | { readonly kind: "clear" };

function sizeOf(value: unknown): number {
  if (value instanceof Blob) return value.size;
  if (typeof value === "object" && value !== null && "blob" in value) {
    const { blob } = value;
    if (blob instanceof Blob) return blob.size;
  }
  return 0;
}

function matches(key: string, target: IDBValidKey | IDBKeyRange): boolean {
  return target instanceof IDBKeyRange ? target.includes(key) : target === key;
}

/**
 * Limits the bytes the `blobs` store may hold to `limit`. Deletes free space once their
 * transaction commits, as in Chrome. Returns the bytes stored now, and an undo.
 * `onQuotaExceeded` runs each time a transaction is failed for quota (1, 2, ...), right after it
 * aborts, so a test can act as another tab in the middle of a save's retries.
 */
export function limitBlobQuota(
  limit: number,
  options: { readonly onQuotaExceeded?: (count: number) => void } = {},
): {
  readonly used: () => number;
  readonly restore: () => void;
} {
  const committed = new Map<string, number>();
  const pending = new WeakMap<IDBTransaction, BlobOp[]>();
  const failed = new WeakSet<IDBTransaction>();
  let failures = 0;
  const proto = IDBObjectStore.prototype;
  const { put, delete: remove, clear } = proto;

  const opsOf = (tx: IDBTransaction): BlobOp[] => {
    let ops = pending.get(tx);
    if (ops === undefined) {
      const list: BlobOp[] = [];
      ops = list;
      pending.set(tx, list);
      tx.addEventListener("complete", () => {
        for (const op of list) {
          if (op.kind === "put") committed.set(op.key, op.size);
          else if (op.kind === "clear") committed.clear();
          else for (const key of committed.keys()) if (matches(key, op.key)) committed.delete(key);
        }
      });
    }
    return ops;
  };
  const used = () => [...committed.values()].reduce((sum, size) => sum + size, 0);

  proto.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    const request = put.call(this, value, key);
    if (this.name === "blobs" && typeof key === "string") {
      const tx = this.transaction;
      const ops = opsOf(tx);
      ops.push({ kind: "put", key, size: sizeOf(value) });
      const staged = ops.reduce((sum, op) => sum + (op.kind === "put" ? op.size : 0), 0);
      if (used() + staged > limit && !failed.has(tx)) {
        failed.add(tx);
        // After the rest of this synchronous batch of requests, like a commit-time quota check.
        queueMicrotask(() => {
          tx.abort();
          Object.defineProperty(tx, "error", {
            value: new DOMException("Quota exceeded", "QuotaExceededError"),
          });
          failures += 1;
          options.onQuotaExceeded?.(failures);
        });
      }
    }
    return request;
  };
  proto.delete = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    const request = remove.call(this, query);
    if (this.name === "blobs") opsOf(this.transaction).push({ kind: "delete", key: query });
    return request;
  };
  proto.clear = function (this: IDBObjectStore) {
    const request = clear.call(this);
    if (this.name === "blobs") opsOf(this.transaction).push({ kind: "clear" });
    return request;
  };
  return {
    used,
    restore: () => {
      proto.put = put;
      proto.delete = remove;
      proto.clear = clear;
    },
  };
}
