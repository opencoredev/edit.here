import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canStoreBlobs, resetBlobStorageProbeForTests } from "../src/lib/blob-storage-probe";

/** An IndexedDB whose object stores refuse Blob values, as Safari Private Browsing does. */
function privateBrowsingFactory(): IDBFactory {
  const factory = new IDBFactory();
  const open = factory.open.bind(factory);
  vi.spyOn(factory, "open").mockImplementation((name, version) => {
    const request = open(name, version);
    request.addEventListener("success", () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (stores, mode, options) => {
        const tx = transaction(stores, mode, options);
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = (storeName) => {
          const store = objectStore(storeName);
          store.put = () => {
            throw new DOMException("Blobs are not supported", "UnknownError");
          };
          return store;
        };
        return tx;
      };
    });
    return request;
  });
  return factory;
}

afterEach(() => {
  resetBlobStorageProbeForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("canStoreBlobs", () => {
  it("is true where IndexedDB stores Blobs, and leaves no database behind", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    expect(await canStoreBlobs()).toBe(true);
    await vi.waitFor(async () => expect(await factory.databases()).toEqual([]));
  });

  it("is false where IndexedDB refuses Blobs", async () => {
    vi.stubGlobal("indexedDB", privateBrowsingFactory());
    expect(await canStoreBlobs()).toBe(false);
  });

  it("gives no verdict without IndexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await canStoreBlobs()).toBe(true);
  });

  it("gives no verdict when out of quota, and probes again next time", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(await canStoreBlobs()).toBe(true);
    expect(await canStoreBlobs()).toBe(true);
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("gives no verdict when a write fails for quota after it was queued", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const request = put.apply(this, args);
      // The request failed for quota; the abort below must not overwrite that.
      const quota = new DOMException("Full", "QuotaExceededError");
      Object.defineProperty(request, "error", { get: () => quota, set: () => {} });
      this.transaction.abort();
      return request;
    });
    expect(await canStoreBlobs()).toBe(true);
    expect(await canStoreBlobs()).toBe(true);
  });

  it("is not blocked by a connection another tab left open on its probe database", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    const open = factory.open.bind(factory);
    const held: IDBDatabase[] = [];
    vi.spyOn(factory, "open").mockImplementation((name, version) => {
      const request = open(name, version);
      request.addEventListener("success", () => {
        held.push(request.result);
      });
      return request;
    });
    expect(await canStoreBlobs()).toBe(true);
    resetBlobStorageProbeForTests();
    expect(await canStoreBlobs()).toBe(true);
    expect(new Set(held.map((db) => db.name)).size).toBe(2);
  });

  it("probes once per page", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    const open = vi.spyOn(factory, "open");
    await canStoreBlobs();
    await canStoreBlobs();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
