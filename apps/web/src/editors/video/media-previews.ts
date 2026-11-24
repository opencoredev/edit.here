/** Filmstrip thumbnails and an audio waveform for the timeline, decoded with mediabunny. */
import { filmstripTimestamps } from "@edit-here/core";
import {
  AudioBufferSink,
  CanvasSink,
  type InputAudioTrack,
  type InputVideoTrack,
} from "mediabunny";
import { useEffect, useState } from "react";

export type FilmstripTile = {
  readonly index: number;
  readonly bitmap: ImageBitmap;
};

/**
 * Decodes `count` evenly spaced thumbnails of `tileWidth`×`tileHeight` device pixels. Tiles
 * stream in as they decode; the previous strip stays until the first new tile arrives.
 */
export function useFilmstrip(args: {
  readonly track: InputVideoTrack | null;
  readonly duration: number;
  readonly count: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
}): readonly FilmstripTile[] {
  const { track, duration, count, tileWidth, tileHeight } = args;
  const [tiles, setTiles] = useState<readonly FilmstripTile[]>([]);

  useEffect(() => {
    if (track === null || count <= 0 || tileWidth <= 0 || tileHeight <= 0) return;
    let cancelled = false;
    const created: ImageBitmap[] = [];
    const run = async () => {
      const sink = new CanvasSink(track, {
        width: Math.round(tileWidth),
        height: Math.round(tileHeight),
        fit: "cover",
        poolSize: 2,
      });
      const timestamps = filmstripTimestamps({ duration, count });
      let index = 0;
      let fresh = true;
      for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
        if (cancelled) return;
        const tileIndex = index++;
        if (wrapped === null) continue;
        const bitmap = await createImageBitmap(wrapped.canvas);
        if (cancelled) {
          bitmap.close();
          return;
        }
        created.push(bitmap);
        const tile = { index: tileIndex, bitmap };
        const replace = fresh;
        fresh = false;
        setTiles((previous) => (replace ? [tile] : [...previous, tile]));
      }
    };
    // Thumbnails are decoration: a decode failure leaves the strip empty.
    run().catch(() => undefined);
    return () => {
      cancelled = true;
      // Bitmaps from this run are closed once a newer run or unmount replaces them.
      window.setTimeout(() => created.forEach((bitmap) => bitmap.close()), 1_000);
    };
  }, [track, duration, count, tileWidth, tileHeight]);

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
