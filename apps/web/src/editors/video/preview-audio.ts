/**
 * Live preview gain for the `<video>` element. Volume above 100% and smooth fades need Web Audio:
 * the element is routed once through a `GainNode`. A media element can be attached to only one
 * `MediaElementAudioSourceNode` for its lifetime, so graphs are kept per element in a WeakMap;
 * StrictMode's double effects and remounts reuse the same graph instead of throwing.
 *
 * `releasePreviewAudio` runs when the editor lets go of the element: it suspends the context at
 * once and closes it once the element has left the page, so a closed video leaves no running
 * `AudioContext` behind. A StrictMode re-run keeps the element in the page; the next play resumes.
 */

type Graph = {
  readonly context: AudioContext;
  readonly gain: GainNode;
};

const graphs = new WeakMap<HTMLVideoElement, Graph | "unavailable">();

/**
 * The element's graph, created on first call. Call it from a user gesture (play) so the
 * context may start. Returns null when Web Audio can't take the element; callers then fall
 * back to `video.volume`, which tops out at 100%.
 */
export function attachPreviewAudio(video: HTMLVideoElement): Graph | null {
  const existing = graphs.get(video);
  if (existing === "unavailable") return null;
  if (existing !== undefined) {
    if (existing.context.state === "suspended") void existing.context.resume();
    return existing;
  }
  if (typeof AudioContext === "undefined") {
    graphs.set(video, "unavailable");
    return null;
  }
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(video);
    const gain = context.createGain();
    source.connect(gain).connect(context.destination);
    // The graph now carries the sound: gain handles mute and volume, the element plays at unity.
    video.muted = false;
    video.volume = 1;
    if (context.state === "suspended") void context.resume();
    const graph: Graph = { context, gain };
    graphs.set(video, graph);
    return graph;
  } catch {
    graphs.set(video, "unavailable");
    return null;
  }
}

/** Sets the preview gain (0–2). Ramps over ~15 ms so changes never click. */
export function setPreviewGain(video: HTMLVideoElement, gain: number): void {
  const graph = graphs.get(video);
  if (graph === undefined || graph === "unavailable") {
    video.muted = gain <= 0;
    video.volume = Math.min(1, Math.max(0, gain));
    return;
  }
  graph.gain.gain.setTargetAtTime(gain, graph.context.currentTime, 0.015);
}

/**
 * Stops the element's audio graph. Suspends now; closes the context and forgets the graph when
 * the element is no longer in the document after this task (the editor closed for good).
 */
export function releasePreviewAudio(video: HTMLVideoElement): void {
  const graph = graphs.get(video);
  if (graph === undefined || graph === "unavailable") return;
  if (graph.context.state === "running") void graph.context.suspend().catch(() => undefined);
  setTimeout(() => {
    if (video.isConnected || graphs.get(video) !== graph) return;
    // The element can't be routed through a second context, so it plays through `volume` now.
    graphs.set(video, "unavailable");
    if (graph.context.state !== "closed") void graph.context.close().catch(() => undefined);
  }, 0);
}
