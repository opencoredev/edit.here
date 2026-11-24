/**
 * Decodes filmstrip thumbnails with mediabunny. Runs in the filmstrip worker, or on the main
 * thread when workers can't (the same code either way, so tiles look the same).
 */
import { filmstripTimestamps } from "@edit-here/core";
import { CanvasSink, type InputVideoTrack } from "mediabunny";

export type FilmstripJob = {
  readonly track: InputVideoTrack;
  readonly duration: number;
  readonly count: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
};

/**
 * Calls `onTile` with each of `count` evenly spaced thumbnails as it decodes, in order. Stops
 * early once `isCancelled` says so; `onTile` owns the bitmaps it receives.
 */
export async function decodeFilmstrip(
  job: FilmstripJob,
  onTile: (index: number, bitmap: ImageBitmap) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const sink = new CanvasSink(job.track, {
    width: Math.round(job.tileWidth),
    height: Math.round(job.tileHeight),
    fit: "cover",
    poolSize: 2,
  });
  const timestamps = filmstripTimestamps({ duration: job.duration, count: job.count });
  let index = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
    if (isCancelled()) return;
    const tileIndex = index++;
    if (wrapped === null) continue;
    // The sink reuses its canvases, so copy each one out.
    const bitmap = await createImageBitmap(wrapped.canvas);
    if (isCancelled()) {
      bitmap.close();
      return;
    }
    onTile(tileIndex, bitmap);
  }
}
