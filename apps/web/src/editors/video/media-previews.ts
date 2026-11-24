/** Filmstrip thumbnails and an audio waveform for the timeline, decoded with mediabunny. */
import { AudioBufferSink, type InputAudioTrack, type InputVideoTrack } from "mediabunny";
import { useEffect, useState } from "react";
import { decodeFilmstrip } from "./filmstrip-decode";
import { isFilmstripReply, type FilmstripRequest } from "./filmstrip-protocol";

export type FilmstripTile = {
  readonly index: number;
  readonly bitmap: ImageBitmap;
};

/** One filmstrip worker shared by every strip on the page; ended when the last one lets go. */
let shared: { readonly worker: Worker; users: number } | null = null;
let nextRequestId = 1;

function acquireWorker(): Worker | null {
  if (shared !== null) {
    shared.users++;
    return shared.worker;
  }
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    const worker = new Worker(new URL("./filmstrip.worker.ts", import.meta.url), {
      type: "module",
    });
    shared = { worker, users: 1 };
    return worker;
  } catch {
    return null;
  }
}

function releaseWorker(worker: Worker): void {
  if (shared === null || shared.worker !== worker) return;
  shared.users--;
  if (shared.users > 0) return;
  shared.worker.terminate();
  shared = null;
}

/**
 * Decodes `count` evenly spaced thumbnails of `tileWidth`×`tileHeight` device pixels, in a
 * worker when the browser has one (falling back to the main thread if it fails). Tiles stream
 * in as they decode; the previous strip stays until the first new tile arrives.
 */
export function useFilmstrip(args: {
  readonly file: File;
  readonly track: InputVideoTrack | null;
  readonly duration: number;
  readonly count: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}): readonly FilmstripTile[] {
  const { file, track, duration, count, tileWidth, tileHeight } = args;
  const [tiles, setTiles] = useState<readonly FilmstripTile[]>([]);

  useEffect(() => {
    if (track === null || count <= 0 || tileWidth <= 0 || tileHeight <= 0) return;
    let cancelled = false;
    const created: ImageBitmap[] = [];
    let fresh = true;
    const publish = (index: number, bitmap: ImageBitmap) => {
      if (cancelled) {
        bitmap.close();
        return;
      }
      created.push(bitmap);
      const tile = { index, bitmap };
      const replace = fresh;
      fresh = false;
      setTiles((previous) => (replace ? [tile] : [...previous, tile]));
    };
    const job = { duration, count, tileWidth, tileHeight };
    // Thumbnails are decoration: a decode failure leaves the strip empty.
    const decodeHere = () => {
      fresh = true;
      decodeFilmstrip({ ...job, track }, publish, () => cancelled).catch(() => undefined);
    };

    const worker = acquireWorker();
    if (worker === null) {
      decodeHere();
      return () => {
        cancelled = true;
        // Bitmaps from this run are closed once a newer run or unmount replaces them.
        window.setTimeout(() => created.forEach((bitmap) => bitmap.close()), 1_000);
      };
    }
    const id = nextRequestId++;
    let settled = false;
    const finish = (fallBack: boolean) => {
      if (settled) return;
      settled = true;
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (fallBack && !cancelled) decodeHere();
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      const reply = event.data;
      if (!isFilmstripReply(reply) || reply.id !== id) return;
      switch (reply.kind) {
        case "tile":
          publish(reply.index, reply.bitmap);
          return;
        case "done":
          finish(false);
          return;
        case "failed":
          finish(true);
          return;
        default: {
          const _exhaustive: never = reply;
          return _exhaustive;
        }
      }
    };
    const onError = () => finish(true);
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const request: FilmstripRequest = { kind: "start", id, file, ...job };
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker, not a window
    worker.postMessage(request);
    return () => {
      cancelled = true;
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a Worker, not a window
      if (!settled) worker.postMessage({ kind: "cancel", id });
      finish(false);
      releaseWorker(worker);
      // Bitmaps from this run are closed once a newer run or unmount replaces them.
      window.setTimeout(() => created.forEach((bitmap) => bitmap.close()), 1_000);
    };
  }, [file, track, duration, count, tileWidth, tileHeight]);

  return tiles;
}

/** Longest clip we decode fully for a waveform; longer clips skip it to stay instant. */
const WAVEFORM_MAX_SECONDS = 15 * 60;

/** Peak amplitude (0..1) per bucket across the clip, or null while decoding or when skipped. */
export function useWaveform(args: {
  readonly track: InputAudioTrack | null;
  readonly duration: number;
  readonly buckets: number;
}): Float32Array | null {
  const { track, duration, buckets } = args;
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (track === null || duration <= 0 || duration > WAVEFORM_MAX_SECONDS) return;
    let cancelled = false;
    const run = async () => {
      const sink = new AudioBufferSink(track);
      const result = new Float32Array(buckets);
      const bucketSeconds = duration / buckets;
      let lastPublish = performance.now();
      for await (const { buffer, timestamp } of sink.buffers()) {
        if (cancelled) return;
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
          buffer.getChannelData(c),
        );
        const rate = buffer.sampleRate;
        // Stride keeps this cheap: peaks don't need every sample.
        const stride = Math.max(1, Math.floor(rate / 2000));
        for (let i = 0; i < buffer.length; i += stride) {
          const bucket = Math.floor((timestamp + i / rate) / bucketSeconds);
          if (bucket < 0 || bucket >= buckets) continue;
          let peak = result[bucket] ?? 0;
          for (const data of channels) {
            const value = Math.abs(data[i] ?? 0);
            if (value > peak) peak = value;
          }
          result[bucket] = peak;
        }
        if (performance.now() - lastPublish > 250) {
          lastPublish = performance.now();
          setPeaks(result.slice());
        }
      }
      if (!cancelled) setPeaks(result);
    };
    run().catch(() => {
      if (!cancelled) setPeaks(null);
    });
    return () => {
      cancelled = true;
    };
  }, [track, duration, buckets]);

  return peaks;
}
