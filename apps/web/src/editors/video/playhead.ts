/**
 * The playhead changes every animation frame while playing. It lives in a tiny external store so
 * only the timecode and playhead marker re-render, not the whole editor.
 */
import { useSyncExternalStore } from "react";

export type PlayheadStore = {
  readonly get: () => number;
  readonly set: (time: number) => void;
  readonly subscribe: (listener: () => void) => () => void;
};

export function createPlayheadStore(initial = 0): PlayheadStore {
  let time = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set: (next) => {
      if (next === time) return;
      time = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function usePlayhead(store: PlayheadStore): number {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Re-renders only when the derived value changes (e.g. the segment under the playhead). */
export function usePlayheadSelector<T>(store: PlayheadStore, select: (time: number) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  );
}
