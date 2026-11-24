/**
 * Decodes filmstrip thumbnails off the main thread. Scaling each decoded frame down to a tile
 * costs tens of milliseconds per tile, which would otherwise compete with the first frame,
 * playback and the first interactions after opening a video.
 */
import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { decodeFilmstrip } from "./filmstrip-decode";
import {
  isFilmstripCommand,
  type FilmstripReply,
  type FilmstripRequest,
} from "./filmstrip-protocol";

const running = new Set<number>();
const cancelled = new Set<number>();
/** The last file's demuxer, reused while the timeline resizes. */
let opened: { readonly file: File; readonly input: Input<BlobSource> } | null = null;

function send(reply: FilmstripReply, transfer: Transferable[] = []): void {
  self.postMessage(reply, { transfer });
}

function inputFor(file: File): Input<BlobSource> {
  if (opened?.file === file) return opened.input;
  opened?.input.dispose();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  opened = { file, input };
  return input;
}

async function run(request: FilmstripRequest): Promise<void> {
  const { id } = request;
  running.add(id);
  try {
    const track = await inputFor(request.file).getPrimaryVideoTrack();
    if (track === null) throw new Error("No video track.");
    await decodeFilmstrip(
      { ...request, track },
      (index, bitmap) => send({ kind: "tile", id, index, bitmap }, [bitmap]),
      () => cancelled.has(id),
    );
    send({ kind: "done", id });
  } catch {
    send({ kind: "failed", id });
  } finally {
    running.delete(id);
    cancelled.delete(id);
  }
}

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const command = event.data;
  if (!isFilmstripCommand(command)) return;
  switch (command.kind) {
    case "cancel":
      if (running.has(command.id)) cancelled.add(command.id);
      return;
    case "start":
      void run(command);
      return;
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
});
