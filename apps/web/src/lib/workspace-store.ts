/**
 * Recent projects (a file and its edits), kept in IndexedDB so a reload picks up where the user
 * left off and Home can reopen earlier work. Nothing leaves the device.
 *
 * Stores of `edit-here-db` (version 2):
 *
 * - `projects`: one header per project, by project id: meta, file name and type, the editor's
 *   state, the extra files' ids, a token per stored blob, a small thumbnail, time.
 * - `blobs`: `<id>:file` holds the file's bytes, `<id>:extra:<assetId>` each extra file (a pasted
 *   picture). An edit rewrites only the small header, not the bytes.
 * - `pointers`: `active` names the project a new tab or a reload reopens. Going Home clears it
 *   and keeps the project. Each tab also remembers its own choice in sessionStorage, so a reload
 *   reopens what that tab had open even while another tab works on something else; a tab that
 *   reopened the shared choice pins it in its own storage. `clear-epoch` counts "Clear all"s.
 *
 * Version 1 kept a single workspace in a `workspace` store; the upgrade moves it into these
 * stores as the active project.
 *
 * Several tabs share the database, so a save never trusts what this tab wrote before. Each Blob
 * object gets a random token the first time it is saved or loaded, and the header records the
 * token of every blob it stored. Inside the write transaction a save reads the stored header and
 * skips a blob only when that header lists this exact blob's token for the same key; any other
 * tab's save leaves different tokens, so the blob is written again in the same transaction as its
 * metadata. Projects live under their own keys, so two tabs on two projects never touch each
 * other's bytes.
 *
 * A deleted project stays deleted. Each tab remembers the projects it saw stored (saved or
 * loaded) and the clear epoch at that time; a later save of one of them, from an editor still
 * open in this tab, writes nothing when its header is gone (another tab deleted it, or cleared
 * everything) or the epoch moved on. A project first saved after a "Clear all" saves as usual.
 *
 * Every write stamps the header with a random `writeId`, and each tab remembers the revision it
 * last wrote or loaded per project. When a save fails and the tab drops its now stale project,
 * it deletes only that revision: a newer one saved by another tab stays, and a project already
 * gone (deleted or cleared elsewhere) stays remembered as deleted.
 *
 * At most `MAX_RECENT_PROJECTS` are kept; saving drops the oldest beyond that. A save that runs
 * out of quota drops the oldest others one by one and tries again, holding each dropped project
 * in memory; if it still fails, it puts them back, so a save too big to fit never costs the user
 * their other projects. One is not put back when a "Clear all" ran meanwhile or another tab
 * stored a project under its id. Every call fails soft: private windows, a full disk, a blocked
 * database or a file over `MAX_STORED_BYTES` mean the project is not saved; editing goes on as
 * before.
 */
import {
  MAX_RECENT_PROJECTS,
  oldestRecent,
  recentToPrune,
  sortRecent,
  type LoadedMediaMeta,
} from "@edit-here/core";
import { Option, Schema } from "effect";
import { randomId } from "./new-id";

const DB_NAME = "edit-here-db";
const DB_VERSION = 2;
const PROJECTS = "projects";
const BLOBS = "blobs";
const POINTERS = "pointers";
const ACTIVE_POINTER = "active";
/** How many times "Clear all" ran, under `pointers`. Absent reads as 0. */
const CLEAR_EPOCH = "clear-epoch";
/** The single-workspace store of version 1, migrated and removed on upgrade. */
const LEGACY_STORE = "workspace";
/** This tab's open project, or "" once it went Home. */
const TAB_POINTER_KEY = "edit-here:active-project";

/** Files larger than this together are not saved (IndexedDB quotas and slow writes). */
export const MAX_STORED_BYTES = 200 * 1024 * 1024;

/** How long a save waits for its thumbnail before going ahead without a new one. */
const THUMBNAIL_WAIT_MS = 4000;

export type StoredExtraFile = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly blob: Blob;
};

export type WorkspaceRecord = {
  readonly id: string;
  readonly meta: LoadedMediaMeta;
  readonly file: Blob;
  readonly fileName: string;
  readonly fileType: string;
  /** The editor's state as it handed it over; parsed by the editor on restore. */
  readonly state: unknown;
  readonly extraFiles: readonly StoredExtraFile[];
  readonly updatedAt: number;
  /** A new thumbnail (data URL). Absent, or resolving to null, keeps the saved one. */
  readonly thumbnail?: Promise<string | null>;
};

/** A project read back from storage: its file and extras come back as `File`s, ready to open. */
export type RestoredWorkspace = Omit<WorkspaceRecord, "file" | "extraFiles" | "thumbnail"> & {
  readonly file: File;
  readonly extraFiles: readonly (StoredExtraFile & { readonly blob: File })[];
  readonly thumbnail: string | null;
};

/** What Home lists for a saved project. */
export type RecentWorkspace = {
  readonly id: string;
  readonly meta: LoadedMediaMeta;
  readonly fileName: string;
  readonly thumbnail: string | null;
  readonly updatedAt: number;
};

const MetaSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  size: Schema.Finite,
  // PDF projects saved by earlier builds no longer decode, so they are left out of the list and
  // never reopened.
  kind: Schema.Literals(["image", "video"]),
});

const HeaderSchema = Schema.Struct({
  id: Schema.String,
  meta: MetaSchema,
  fileName: Schema.String,
  fileType: Schema.String,
  state: Schema.Unknown,
  extraFileIds: Schema.Array(Schema.String),
  /** Token of the blob under `<id>:file`. */
  fileToken: Schema.String,
  /** Extra file id to the token of the blob under `<id>:extra:<extra id>`. */
  extraTokens: Schema.Record(Schema.String, Schema.String),
  thumbnail: Schema.NullOr(Schema.String),
  updatedAt: Schema.Finite,
  /** Random per write, so a tab can tell its own revision from another tab's. Absent before. */
  writeId: Schema.optional(Schema.String),
});

type Header = typeof HeaderSchema.Type;

/** The version 1 header under `active` of the `workspace` store. */
const LegacyHeaderSchema = Schema.Struct({
  id: Schema.String,
  meta: MetaSchema,
  fileName: Schema.String,
  fileType: Schema.String,
  state: Schema.Unknown,
  extraFileIds: Schema.Array(Schema.String),
  blobTokens: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  updatedAt: Schema.Finite,
});

const ExtraSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  blob: Schema.instanceOf(Blob),
});

const decodeHeader = Schema.decodeUnknownOption(HeaderSchema);
const decodeLegacyHeader = Schema.decodeUnknownOption(LegacyHeaderSchema);
const decodeExtra = Schema.decodeUnknownOption(ExtraSchema);
const isBlob = (value: unknown): value is Blob => value instanceof Blob;

const fileKey = (id: string) => `${id}:file`;
const extraKey = (id: string, extraId: string) => `${id}:extra:${extraId}`;
/** Every blob key of project `id`. */
const projectBlobRange = (id: string) => IDBKeyRange.bound(`${id}:`, `${id}:￿`);

// ---------------------------------------------------------------------------
// Opening and upgrading

/** Moves the version 1 workspace into the version 2 stores, then drops the old store. */
function migrateLegacy(db: IDBDatabase, tx: IDBTransaction): void {
  const legacy = tx.objectStore(LEGACY_STORE);
  const values = new Map<string, unknown>();
  const cursor = legacy.openCursor();
  cursor.addEventListener("success", () => {
    const current = cursor.result;
    if (current !== null) {
      if (typeof current.key === "string") values.set(current.key, current.value);
      current.continue();
      return;
    }
    const header = decodeLegacyHeader(values.get("active"));
    const file = values.get("active:file");
    if (Option.isSome(header) && isBlob(file)) {
      const { id, meta, fileName, fileType, state, updatedAt } = header.value;
      const tokens = header.value.blobTokens ?? {};
      const blobs = tx.objectStore(BLOBS);
      const fileToken = tokens["active:file"] ?? randomId();
      blobs.put(file, fileKey(id));
      const extraTokens: Record<string, string> = {};
      const extraFileIds: string[] = [];
      for (const extraId of header.value.extraFileIds) {
        const extra = decodeExtra(values.get(`extra:${extraId}`));
        if (Option.isNone(extra)) continue;
        blobs.put(extra.value, extraKey(id, extraId));
        extraTokens[extraId] = tokens[`extra:${extraId}`] ?? randomId();
        extraFileIds.push(extraId);
      }
      const migrated: Header = {
        id,
        meta,
        fileName,
        fileType,
        state,
        extraFileIds,
        fileToken,
        extraTokens,
        thumbnail: null,
        updatedAt,
        writeId: randomId(),
      };
      tx.objectStore(PROJECTS).put(migrated, id);
      tx.objectStore(POINTERS).put(id, ACTIVE_POINTER);
    }
    db.deleteObjectStore(LEGACY_STORE);
  });
}

let opening: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    let settled = false;
    const settle = (db: IDBDatabase | null) => {
      settled = true;
      resolve(db);
    };
    try {
      if (typeof indexedDB === "undefined") {
        settle(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        for (const name of [PROJECTS, BLOBS, POINTERS]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
        const tx = request.transaction;
        if (tx !== null && db.objectStoreNames.contains(LEGACY_STORE)) migrateLegacy(db, tx);
      });
      request.addEventListener("success", () => {
        const db = request.result;
        // A newer build in another tab wants to upgrade: step aside, reopen on the next call.
        db.addEventListener("versionchange", () => {
          db.close();
          opening = null;
        });
        if (settled) {
          // It opened after this tab gave up waiting (blocked); the next call opens again.
          db.close();
          return;
        }
        settle(db);
      });
      request.addEventListener("error", () => settle(null));
      // An open tab of an older build holds version 1; save nothing until it closes.
      request.addEventListener("blocked", () => settle(null));
    } catch {
      settle(null);
    }
  }).then((db) => {
    // A failed open is retried next time instead of being remembered.
    if (db === null) opening = null;
    return db;
  });
  return opening;
}

function requestValue(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed")),
    );
  });
}

/**
 * Settles when `tx` commits or fails. Already handled, so a transaction that fails while the
 * caller is still awaiting one of its requests doesn't also report an unhandled rejection.
 */
function transactionDone(tx: IDBTransaction): Promise<void> {
  const done = new Promise<void>((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("error", () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed")),
    );
    tx.addEventListener("abort", () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted")),
    );
  });
  done.catch(() => undefined);
  return done;
}

function isQuotaError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "QuotaExceededError";
}

/**
 * Reads and writes run one after another, so a save that started later never lands before an
 * earlier one, a delete wins over the saves queued before it, and a list sees every save queued
 * before it.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  const run = queue.then(work).catch(() => fallback);
  queue = run;
  return run;
}

/**
 * A random token per Blob object this tab saved or loaded. Tokens are never shared between tabs,
 * so a header listing this blob's token proves the bytes under that key are this blob's.
 */
const blobTokens = new WeakMap<Blob, string>();

function tokenOf(blob: Blob): string {
  let token = blobTokens.get(blob);
  if (token === undefined) {
    token = randomId();
    blobTokens.set(blob, token);
  }
  return token;
}

/**
 * Projects this tab saw stored, by id, with the clear epoch it read then. A save of one of them
 * that finds its header gone, or a newer epoch, was deleted meanwhile and must not bring it back.
 */
const seen = new Map<string, number>();

/** The `writeId` of each project this tab last wrote or loaded. */
const revisions = new Map<string, string>();

const deleteMarkerKey = (id: string): string => `deleted:${id}`;

async function readEpoch(pointers: IDBObjectStore): Promise<number> {
  const value = await requestValue(pointers.get(CLEAR_EPOCH));
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function readDeleteMarker(pointers: IDBObjectStore, id: string): Promise<number> {
  const value = await requestValue(pointers.get(deleteMarkerKey(id)));
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// This tab's pointer

/** This tab's own choice: a project id, null once it went Home, undefined for a new tab. */
function readTabPointer(): string | null | undefined {
  try {
    const value = sessionStorage.getItem(TAB_POINTER_KEY);
    if (value === null) return undefined;
    return value === "" ? null : value;
  } catch {
    return undefined;
  }
}

function writeTabPointer(id: string | null): void {
  try {
    sessionStorage.setItem(TAB_POINTER_KEY, id ?? "");
  } catch {
    // Storage blocked: the shared pointer still works.
  }
}

// ---------------------------------------------------------------------------
// Reading

async function readHeaders(db: IDBDatabase): Promise<Header[]> {
  const tx = db.transaction(PROJECTS, "readonly");
  const all = await requestValue(tx.objectStore(PROJECTS).getAll());
  if (!Array.isArray(all)) return [];
  const headers: Header[] = [];
  for (const value of all) {
    const header = decodeHeader(value);
    if (Option.isSome(header)) headers.push(header.value);
  }
  return headers;
}

/**
 * Every stored project key for storage cleanup (quota eviction and pruning), including
 * unsupported records such as legacy PDFs. Unsupported entries get `Number.MIN_SAFE_INTEGER`
 * so they are always evicted and pruned ahead of visible image/video projects.
 */
async function readStoredEntries(
  db: IDBDatabase,
): Promise<{ readonly id: string; readonly updatedAt: number }[]> {
  const tx = db.transaction(PROJECTS, "readonly");
  const store = tx.objectStore(PROJECTS);
  const [keys, values] = await Promise.all([
    requestValue(store.getAllKeys()),
    requestValue(store.getAll()),
  ]);
  if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length) return [];
  const entries: { readonly id: string; readonly updatedAt: number }[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") continue;
    const header = decodeHeader(values[index]);
    entries.push({
      id: key,
      updatedAt: Option.isSome(header) ? header.value.updatedAt : Number.MIN_SAFE_INTEGER,
    });
  }
  return entries;
}

type ReadProjectResult = {
  readonly restored: RestoredWorkspace;
  readonly epoch: number;
  readonly writeId: string | undefined;
};

async function readProjectInTx(
  tx: IDBTransaction,
  id: string,
  writable: boolean,
): Promise<ReadProjectResult | null> {
  const projects = tx.objectStore(PROJECTS);
  const header = decodeHeader(await requestValue(projects.get(id)));
  if (Option.isNone(header)) return null;
  const pointers = tx.objectStore(POINTERS);
  const epoch = await readEpoch(pointers);
  const blobs = tx.objectStore(BLOBS);
  const stored = await requestValue(blobs.get(fileKey(id)));
  if (!isBlob(stored)) {
    if (writable) {
      const pointer = await requestValue(pointers.get(ACTIVE_POINTER));
      deleteInTransaction(tx, id, pointer);
    }
    return null;
  }
  let writeId = header.value.writeId;
  if (writable && writeId === undefined) {
    // Stamp a pre-writeId header atomically in the same transaction that reads it, so neither
    // another tab's quota eviction nor a newer write by an older tab (which omits writeId) can
    // slip in between reading and stamping.
    writeId = randomId();
    projects.put({ ...header.value, writeId }, id);
  }
  const { meta, fileName, fileType, state, updatedAt, thumbnail } = header.value;
  // Hand back Files, and give each the stored token, so saving them again skips the bytes.
  const file = new File([stored], fileName, { type: fileType });
  blobTokens.set(file, header.value.fileToken);
  const extraFiles: (StoredExtraFile & { readonly blob: File })[] = [];
  for (const extraId of header.value.extraFileIds) {
    const extra = decodeExtra(await requestValue(blobs.get(extraKey(id, extraId))));
    if (Option.isNone(extra)) continue;
    const blob = new File([extra.value.blob], extra.value.name, { type: extra.value.type });
    const token = header.value.extraTokens[extraId];
    if (token !== undefined) blobTokens.set(blob, token);
    extraFiles.push({ ...extra.value, blob });
  }
  return {
    restored: { id, meta, file, fileName, fileType, state, extraFiles, updatedAt, thumbnail },
    epoch,
    writeId,
  };
}

async function readProject(db: IDBDatabase, id: string): Promise<RestoredWorkspace | null> {
  // Use one atomic readwrite transaction so pre-writeId stamping (or cleanup of a header missing
  // its blob) never opens a gap between reading and writing. Already-stamped records do no writes.
  try {
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
    const done = transactionDone(tx);
    const result = await readProjectInTx(tx, id, true);
    await done;
    if (result === null) return null;
    seen.set(id, result.epoch);
    if (result.writeId !== undefined) revisions.set(id, result.writeId);
    else revisions.delete(id);
    return result.restored;
  } catch {
    // Full disk or read-only storage: fall back to a readonly read without claiming ownership.
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readonly");
    const result = await readProjectInTx(tx, id, false);
    if (result === null) return null;
    seen.set(id, result.epoch);
    if (result.writeId !== undefined) revisions.set(id, result.writeId);
    else revisions.delete(id);
    return result.restored;
  }
}

/** Saved projects, newest first. */
export function listRecentWorkspaces(): Promise<readonly RecentWorkspace[]> {
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return [];
    return sortRecent(await readHeaders(db))
      .slice(0, MAX_RECENT_PROJECTS)
      .map(({ id, meta, fileName, thumbnail, updatedAt }) => ({
        id,
        meta,
        fileName,
        thumbnail,
        updatedAt,
      }));
  }, []);
}

/** Saved project `id`, or null when it is gone or can't be read. */
export function loadWorkspaceById(id: string): Promise<RestoredWorkspace | null> {
  return enqueue(async () => {
    const db = await openDatabase();
    return db === null ? null : readProject(db, id);
  }, null);
}

/**
 * The project this tab (or, in a new tab, the last tab to edit) had open, or null when it went
 * Home or the project can't be read.
 */
export function loadActiveWorkspace(): Promise<RestoredWorkspace | null> {
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return null;
    let id = readTabPointer();
    if (id === undefined) {
      const tx = db.transaction(POINTERS, "readonly");
      const shared = await requestValue(tx.objectStore(POINTERS).get(ACTIVE_POINTER));
      id = typeof shared === "string" ? shared : null;
    }
    if (id === null) return null;
    const restored = await readProject(db, id);
    // Pin what this tab reopened, so its reload keeps it while another tab opens something else.
    // A choice the tab made meanwhile (Home, another file) wins.
    const pinned = readTabPointer();
    if (restored !== null && (pinned === undefined || pinned === restored.id)) {
      writeTabPointer(restored.id);
    }
    return restored;
  }, null);
}

// ---------------------------------------------------------------------------
// Writing

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Deletes project `id` inside `tx`, and the shared pointer when it names it. */
function deleteInTransaction(tx: IDBTransaction, id: string, pointer: unknown): void {
  tx.objectStore(PROJECTS).delete(id);
  tx.objectStore(BLOBS).delete(projectBlobRange(id));
  if (pointer === id) tx.objectStore(POINTERS).delete(ACTIVE_POINTER);
}

/** Deletes projects `ids`; resolves to whether that committed. */
async function deleteProjects(db: IDBDatabase, ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  try {
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
    const done = transactionDone(tx);
    const pointer = await requestValue(tx.objectStore(POINTERS).get(ACTIVE_POINTER));
    for (const id of ids) deleteInTransaction(tx, id, pointer);
    await done;
    return true;
  } catch {
    // Nothing more to do; the next save or delete tries again.
    return false;
  }
}

/**
 * Drops this tab's own project after a save of it failed, so a reload doesn't bring back stale
 * work. It deletes only the revision this tab last wrote or loaded, in the same transaction that
 * checks it: a newer revision from another tab stays. Only when it deleted that revision itself,
 * with no "Clear all" since, does it forget having seen the project, so a later save may store
 * it afresh. A project already gone was deleted elsewhere and stays deleted.
 */
async function forgetOwnProject(db: IDBDatabase, id: string): Promise<void> {
  try {
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
    const done = transactionDone(tx);
    const pointers = tx.objectStore(POINTERS);
    const existing = decodeHeader(await requestValue(tx.objectStore(PROJECTS).get(id)));
    const epoch = await readEpoch(pointers);
    const pointer = await requestValue(pointers.get(ACTIVE_POINTER));
    const revision = revisions.get(id);
    const seenEpoch = seen.get(id);
    const own =
      Option.isSome(existing) &&
      revision !== undefined &&
      existing.value.writeId === revision &&
      (seenEpoch === undefined || seenEpoch === epoch);
    if (own) deleteInTransaction(tx, id, pointer);
    await done;
    if (own) {
      seen.delete(id);
      revisions.delete(id);
    }
  } catch {
    // Nothing deleted; the guard stays, so a later save can't bring back a deleted project.
  }
}

/** A project as stored, held in memory while a save that ran out of quota borrows its space. */
type EvictedProject = {
  readonly id: string;
  readonly header: unknown;
  readonly blobs: readonly (readonly [IDBValidKey, unknown])[];
  readonly wasActive: boolean;
  /** The clear epoch when it was evicted; a "Clear all" since means it stays gone. */
  readonly clearEpoch: number;
  /** Per-id delete marker when evicted; an explicit delete since means it stays gone. */
  readonly deleteMarker: number;
};

/** What evicting a project did: freed its space, found it already gone, or failed. */
type Eviction =
  | { readonly kind: "evicted"; readonly project: EvictedProject }
  | { readonly kind: "gone" }
  | { readonly kind: "failed" };

/** Reads project `id` as stored and deletes it in one transaction. */
async function evictProject(db: IDBDatabase, id: string): Promise<Eviction> {
  try {
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
    const done = transactionDone(tx);
    const projects = tx.objectStore(PROJECTS);
    const exists = (await requestValue(projects.getKey(id))) !== undefined;
    const header = exists ? await requestValue(projects.get(id)) : undefined;
    const blobStore = tx.objectStore(BLOBS);
    const keys = await requestValue(blobStore.getAllKeys(projectBlobRange(id)));
    const values = await requestValue(blobStore.getAll(projectBlobRange(id)));
    const pointers = tx.objectStore(POINTERS);
    const pointer = await requestValue(pointers.get(ACTIVE_POINTER));
    const clearEpoch = await readEpoch(pointers);
    const deleteMarker = await readDeleteMarker(pointers, id);
    if (!exists) {
      // Deleted by another tab since the save listed it: its space is already free.
      await done;
      return { kind: "gone" };
    }
    if (!Array.isArray(keys) || !Array.isArray(values) || keys.length !== values.length) {
      tx.abort();
      await done.catch(() => undefined);
      return { kind: "failed" };
    }
    // The Blob objects read here stay readable after the delete, so putting them back needs no
    // copy of the bytes.
    const blobs = keys.map((key: IDBValidKey, index) => [key, values[index]] as const);
    deleteInTransaction(tx, id, pointer);
    await done;
    return {
      kind: "evicted",
      project: { id, header, blobs, wasActive: pointer === id, clearEpoch, deleteMarker },
    };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Puts back projects a failed save evicted, as they were, each in its own transaction so one
 * that fails doesn't keep the others out. It skips a project when "Clear all" or an explicit
 * delete of that id ran since eviction, or another tab stored a project under its id meanwhile.
 * Best effort; it never deletes.
 */
async function restoreEvicted(db: IDBDatabase, evicted: readonly EvictedProject[]): Promise<void> {
  for (const project of evicted) {
    try {
      const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
      const done = transactionDone(tx);
      const projects = tx.objectStore(PROJECTS);
      const pointers = tx.objectStore(POINTERS);
      const epoch = await readEpoch(pointers);
      const deleteMarker = await readDeleteMarker(pointers, project.id);
      const currentKey = await requestValue(projects.getKey(project.id));
      const pointer = await requestValue(pointers.get(ACTIVE_POINTER));
      if (
        epoch === project.clearEpoch &&
        deleteMarker === project.deleteMarker &&
        currentKey === undefined
      ) {
        projects.put(project.header, project.id);
        const blobs = tx.objectStore(BLOBS);
        for (const [key, value] of project.blobs) blobs.put(value, key);
        if (project.wasActive && pointer === undefined) pointers.put(project.id, ACTIVE_POINTER);
      }
      await done;
    } catch {
      // Out of space or a broken database: this one stays gone, the rest still go back.
    }
  }
}

/** What a write found: it saved, or the project was deleted since this tab saw it stored. */
type WriteResult = "saved" | "deleted";

async function writeProject(
  db: IDBDatabase,
  record: WorkspaceRecord,
  thumbnail: string | null,
  activate: boolean,
): Promise<WriteResult> {
  const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
  const done = transactionDone(tx);
  const projects = tx.objectStore(PROJECTS);
  const blobs = tx.objectStore(BLOBS);
  const pointers = tx.objectStore(POINTERS);
  const { id } = record;
  // What another tab may have saved or deleted since this one last wrote: read it in this
  // transaction, so nothing can slip in between the check and the write.
  const raw = await requestValue(projects.get(id));
  const existing = decodeHeader(raw);
  const stored = Option.isSome(existing) ? existing.value : null;
  const epoch = await readEpoch(pointers);
  const seenEpoch = seen.get(id);
  if (seenEpoch !== undefined && (raw === undefined || epoch !== seenEpoch)) {
    // Deleted from Home or cleared, here or in another tab: writing would bring it back.
    await done;
    return "deleted";
  }
  const keys = await requestValue(blobs.getAllKeys(projectBlobRange(id)));
  const keep = new Set([fileKey(id), ...record.extraFiles.map((e) => extraKey(id, e.id))]);
  if (Array.isArray(keys)) {
    for (const key of keys) {
      if (typeof key === "string" && !keep.has(key)) blobs.delete(key);
    }
  }
  const fileToken = tokenOf(record.file);
  if (stored?.fileToken !== fileToken) blobs.put(record.file, fileKey(id));
  const extraTokens: Record<string, string> = {};
  for (const extra of record.extraFiles) {
    const token = tokenOf(extra.blob);
    extraTokens[extra.id] = token;
    if (stored?.extraTokens[extra.id] !== token) blobs.put(extra, extraKey(id, extra.id));
  }
  const writeId = randomId();
  const header: Header = {
    id,
    meta: record.meta,
    fileName: record.fileName,
    fileType: record.fileType,
    state: record.state,
    extraFileIds: record.extraFiles.map((e) => e.id),
    fileToken,
    extraTokens,
    thumbnail: thumbnail ?? stored?.thumbnail ?? null,
    updatedAt: record.updatedAt,
    writeId,
  };
  projects.put(header, id);
  if (activate) pointers.put(id, ACTIVE_POINTER);
  await done;
  seen.set(id, epoch);
  revisions.set(id, writeId);
  return "saved";
}

/** A save waiting in the queue. */
type QueuedSave = {
  readonly record: WorkspaceRecord;
  readonly activate: boolean;
  /** `deleteGeneration` when it was asked for. */
  readonly generation: number;
};

/**
 * The newest save waiting per project. When its turn comes, an older queued save of the same
 * project writes this one instead and the later ones have nothing left to do, so a burst of edits
 * costs one write. A delete or clear in between splits the burst (`deleteGeneration`), so a save
 * asked for after a delete never lands before it.
 */
const newestQueued = new Map<string, QueuedSave>();
/** Bumped by every delete and clear. */
let deleteGeneration = 0;
/** What the last write of each project resolved to, for the saves it absorbed. */
const lastSaveResult = new Map<string, boolean>();

/**
 * Saves `record` as a recent project. With `activate`, it also becomes the project a reload
 * reopens; a late save from an editor that already closed passes false, so it doesn't pull the
 * user back in. Resolves to whether it was saved. A file over the size limit, or a save that
 * fails even after borrowing every other project's space (they are put back), removes this
 * project instead, so a reload never brings back stale work. A project deleted since this tab
 * saw it stored is not saved again.
 */
export function saveWorkspace(
  record: WorkspaceRecord,
  options: { readonly activate: boolean },
): Promise<boolean> {
  // The tab's pointer is set now, not when the queue gets here, so a Home click in between wins.
  if (options.activate) writeTabPointer(record.id);
  const prior = newestQueued.get(record.id);
  // A queued save this one replaces may carry a new thumbnail this one doesn't: keep it.
  const inherited =
    record.thumbnail === undefined &&
    prior?.generation === deleteGeneration &&
    prior.record.thumbnail !== undefined
      ? { ...record, thumbnail: prior.record.thumbnail }
      : record;
  const own: QueuedSave = {
    record: inherited,
    activate: options.activate,
    generation: deleteGeneration,
  };
  newestQueued.set(record.id, own);
  return enqueue(async () => {
    const newest = newestQueued.get(record.id);
    // An earlier queued save already wrote a newer record that includes this one.
    if (newest === undefined) return lastSaveResult.get(record.id) ?? false;
    let next = own;
    if (newest.generation === own.generation) {
      next = newest;
      newestQueued.delete(record.id);
    }
    const saved = await writeQueuedSave(next);
    lastSaveResult.set(record.id, saved);
    return saved;
  }, false);
}

async function writeQueuedSave({ record, activate }: QueuedSave): Promise<boolean> {
  const db = await openDatabase();
  if (db === null) return false;
  const thumbnail =
    record.thumbnail === undefined
      ? null
      : await withTimeout(record.thumbnail, THUMBNAIL_WAIT_MS, null);
  const bytes = record.extraFiles.reduce((sum, extra) => sum + extra.blob.size, record.file.size);
  if (bytes > MAX_STORED_BYTES) {
    await forgetOwnProject(db, record.id);
    return false;
  }
  const evicted: EvictedProject[] = [];
  for (;;) {
    try {
      const result = await writeProject(db, record, thumbnail, activate);
      if (result === "deleted") {
        await restoreEvicted(db, evicted);
        return false;
      }
      break;
    } catch (cause) {
      // Anything but quota (a state that can't be cloned): forget this project rather than
      // keep a stale one. Out of quota: borrow the oldest other project's space and try again.
      const oldest = isQuotaError(cause)
        ? oldestRecent({ entries: await readStoredEntries(db), keep: record.id })
        : null;
      const freed: Eviction = oldest === null ? { kind: "failed" } : await evictProject(db, oldest);
      if (freed.kind === "failed") {
        // Nothing left to borrow, or not a quota problem: the others go back as they were.
        await restoreEvicted(db, evicted);
        await forgetOwnProject(db, record.id);
        return false;
      }
      if (freed.kind === "evicted") evicted.push(freed.project);
    }
  }
  // The save fit by dropping `evicted` for good; they were the oldest, so pruning agrees.
  const pruned = recentToPrune({
    entries: await readStoredEntries(db),
    max: MAX_RECENT_PROJECTS,
    keep: record.id,
  });
  await deleteProjects(db, pruned);
  return true;
}

/** Sets project `id`'s thumbnail, if the project is still saved. */
export function saveWorkspaceThumbnail(id: string, thumbnail: Promise<string | null>): void {
  void enqueue(async () => {
    const url = await withTimeout(thumbnail, THUMBNAIL_WAIT_MS, null);
    const db = await openDatabase();
    if (db === null || url === null) return;
    const tx = db.transaction(PROJECTS, "readwrite");
    const done = transactionDone(tx);
    const projects = tx.objectStore(PROJECTS);
    const header = decodeHeader(await requestValue(projects.get(id)));
    if (Option.isSome(header)) projects.put({ ...header.value, thumbnail: url }, id);
    await done;
  }, undefined);
}

/** Makes `id` the project a reload reopens (it was just opened from Home). */
export function setActivePointer(id: string): Promise<void> {
  writeTabPointer(id);
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return;
    const tx = db.transaction(POINTERS, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(POINTERS).put(id, ACTIVE_POINTER);
    await done;
  }, undefined);
}

/** Goes Home: a reload opens the home page. Every project stays saved. */
export function clearActivePointer(): Promise<void> {
  writeTabPointer(null);
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return;
    const tx = db.transaction(POINTERS, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(POINTERS).delete(ACTIVE_POINTER);
    await done;
  }, undefined);
}

/** Forgets project `id`: its header, its bytes, and the pointer if it names it. */
export function deleteWorkspaceById(id: string): Promise<void> {
  deleteGeneration += 1;
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return;
    try {
      const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
      const done = transactionDone(tx);
      const pointers = tx.objectStore(POINTERS);
      const pointer = await requestValue(pointers.get(ACTIVE_POINTER));
      const marker = await readDeleteMarker(pointers, id);
      deleteInTransaction(tx, id, pointer);
      // Mark the delete so an in-flight quota rollback in another tab doesn't put this project back.
      pointers.put(marker + 1, deleteMarkerKey(id));
      await done;
    } catch {
      // Nothing more to do; the next save or delete tries again.
    }
  }, undefined);
}

/** Forgets every saved project. */
export function clearAllWorkspaces(): Promise<void> {
  writeTabPointer(null);
  deleteGeneration += 1;
  return enqueue(async () => {
    const db = await openDatabase();
    if (db === null) return;
    const tx = db.transaction([PROJECTS, BLOBS, POINTERS], "readwrite");
    const done = transactionDone(tx);
    const pointers = tx.objectStore(POINTERS);
    // A tab still editing a cleared project sees the epoch move on and stops saving it.
    const epoch = await readEpoch(pointers);
    for (const name of [PROJECTS, BLOBS, POINTERS]) tx.objectStore(name).clear();
    pointers.put(epoch + 1, CLEAR_EPOCH);
    await done;
  }, undefined);
}
