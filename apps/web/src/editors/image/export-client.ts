/**
 * Exports through a worker (`export-worker.ts`) where the browser can render there, and on the
 * page otherwise. Both run the same `exportImageBlob`, so the file is the same either way; the
 * worker only keeps the page responsive and skips the main thread's idle-time encoding.
 */
import type { ExportRequest, ExportResponse } from "./export-protocol";
import { exportImageBlob } from "./render";
import { textFontReady } from "./text-fonts";

type ExportArgs = Parameters<typeof exportImageBlob>[0];

type Pending = {
  readonly resolve: (response: ExportResponse) => void;
};

type WorkerState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly worker: Worker }
  /** It failed to start or to answer; the page exports from now on. */
  | { readonly kind: "broken" };

let state: WorkerState = { kind: "idle" };
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(): void {
  state = { kind: "broken" };
  for (const [id, request] of pending) request.resolve({ id, kind: "unsupported" });
  pending.clear();
}

function startWorker(): Worker | null {
  switch (state.kind) {
    case "running":
      return state.worker;
    case "broken":
      return null;
    case "idle":
      break;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
    state = { kind: "broken" };
    return null;
  }
  try {
    const worker = new Worker(new URL("./export-worker.ts", import.meta.url), {
      type: "module",
      name: "image-export",
    });
    worker.addEventListener("message", (event: MessageEvent<ExportResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (request === undefined) return;
      pending.delete(response.id);
      request.resolve(response);
    });
    // The script did not load or threw on start: hand everything to the page.
    worker.addEventListener("error", () => {
      worker.terminate();
      failAll();
    });
    worker.addEventListener("messageerror", () => {
      worker.terminate();
      failAll();
    });
    state = { kind: "running", worker };
    return worker;
  } catch {
    state = { kind: "broken" };
    return null;
  }
}

/** Starts the worker ahead of the first export, so that one doesn't wait for it to load. */
export function warmExportWorker(): void {
  startWorker();
}

async function exportInWorker(worker: Worker, args: ExportArgs): Promise<ExportResponse> {
  const id = nextId;
  nextId += 1;
  // Copies, so the editor keeps its own bitmaps; transferring hands these to the worker.
  const [source, layers] = await Promise.all([
    createImageBitmap(args.source),
    Promise.all(
      [...args.layers].map(
        async ([assetId, bitmap]) => [assetId, await createImageBitmap(bitmap)] as const,
      ),
    ),
  ]);
  // The worker may have failed while the copies were made; then nothing would ever answer.
  if (state.kind !== "running" || state.worker !== worker) {
    source.close();
    for (const [, bitmap] of layers) bitmap.close();
    return { id, kind: "unsupported" };
  }
  const request: ExportRequest = {
    id,
    source,
    sourceSize: args.sourceSize,
    state: args.state,
    layers,
    format: args.format,
  };
  const response = new Promise<ExportResponse>((resolve) => pending.set(id, { resolve }));
  worker.postMessage(request, [source, ...layers.map(([, bitmap]) => bitmap)]);
  return response;
}

/**
 * Renders the result at full resolution and encodes it, like `exportImageBlob`, preferring the
 * worker. Anything the worker can't do (no worker canvas, no worker fonts, a failure) is done on
 * the page instead, so this fails only where the page's own export fails.
 */
export async function exportImage(args: ExportArgs): Promise<Blob> {
  const worker = startWorker();
  if (worker !== null) {
    try {
      const response = await exportInWorker(worker, args);
      if (response.kind === "done") return response.blob;
    } catch {
      // Copying the bitmaps failed; the page tries with its own.
    }
  }
  if (args.state.annotations.some((annotation) => annotation.kind === "text")) {
    await textFontReady();
  }
  return exportImageBlob(args);
}
