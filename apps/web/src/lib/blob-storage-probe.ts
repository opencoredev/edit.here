/**
 * Whether this browser's IndexedDB keeps Blobs. Safari Private Browsing opens IndexedDB but
 * refuses to store a Blob or File in it, so the workspace store's saves fail and Recents and
 * reload restore quietly do nothing. The shell probes once and tells the user instead.
 */
import { randomId } from "./new-id";

type ProbeResult = { kind: "stores" } | { kind: "refuses" } | { kind: "inconclusive" };

let settled: Promise<boolean> | null = null;

/**
 * False only when IndexedDB opened but refused the Blob itself. Anything else (no IndexedDB,
 * an open that fails or is blocked, running out of quota) is not a verdict on Blob support, so
 * it reports true and the next call probes again.
 */
export async function canStoreBlobs(): Promise<boolean> {
  if (settled !== null) return settled;
  const result = await probeBlobStorage();
  if (result.kind === "inconclusive") return true;
  settled = Promise.resolve(result.kind === "stores");
  return settled;
}

async function probeBlobStorage(): Promise<ProbeResult> {
  if (typeof indexedDB === "undefined") return { kind: "inconclusive" };
  // Each probe gets its own database, so another tab's probe can never block this one.
  const name = `edit-here-blob-probe-${randomId()}`;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.addEventListener("upgradeneeded", () => request.result.createObjectStore("probe"));
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("IndexedDB open failed")),
      );
      request.addEventListener("blocked", () => reject(new Error("IndexedDB open blocked")));
    });
  } catch {
    return { kind: "inconclusive" };
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("probe", "readwrite");
      const put = tx.objectStore("probe").put(new Blob([new Uint8Array([0])]), "blob");
      tx.addEventListener("complete", () => resolve());
      // A failed request aborts the transaction; its own error (quota or a refused Blob) is set
      // before the transaction's, so read it first.
      tx.addEventListener("abort", () =>
        reject(put.error ?? tx.error ?? new Error("IndexedDB write aborted")),
      );
    });
    return { kind: "stores" };
  } catch (cause) {
    const quota = cause instanceof DOMException && cause.name === "QuotaExceededError";
    return quota ? { kind: "inconclusive" } : { kind: "refuses" };
  } finally {
    db.close();
    indexedDB.deleteDatabase(name);
  }
}

/** Forgets the cached result, for tests. */
export function resetBlobStorageProbeForTests(): void {
  settled = null;
}
