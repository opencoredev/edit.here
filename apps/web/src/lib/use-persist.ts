import { useEffect, useLayoutEffect, useRef } from "react";

/** The least time between two writes; a burst of edits inside it is written once, at its end. */
export const PERSIST_DELAY_MS = 300;

/**
 * Calls `persist` with `value` as soon as it changes. Editors pass committed state only (a drag
 * shows as a draft and commits once), so a change is written straight away and a reload right
 * after an edit still has it. Changes that come within `PERSIST_DELAY_MS` of the last write wait
 * out the rest of that interval, and only the newest is written. A value is skipped only when it
 * is the one storage already holds: the first render's value (already saved) or the last one
 * written. Comparing against the last write rather than the first value means an undo back to
 * the starting state is saved too, so the undone edit does not return on reload, and
 * StrictMode's second effect run writes nothing.
 *
 * A pending write is flushed when the page is hidden or unloaded (a reload, a closed tab), and
 * when the editor unmounts (going Home or opening another file), so the project keeps its last
 * edit in the recent list.
 */
export function usePersist<T>(value: T, persist: ((value: T) => void) | undefined): void {
  const persistRef = useRef(persist);
  useLayoutEffect(() => {
    persistRef.current = persist;
  });
  /** What storage holds now, as far as this editor knows. */
  const saved = useRef(value);
  const pending = useRef<{ readonly value: T } | null>(null);
  /** When the last write went out (`performance.now()`). */
  const lastWrite = useRef(Number.NEGATIVE_INFINITY);
  const write = useRef((next: T) => {
    saved.current = next;
    lastWrite.current = performance.now();
    persistRef.current?.(next);
  });

  useEffect(() => {
    if (value === saved.current) {
      // Back to what is stored (an undo inside the delay): nothing to write, nothing to flush.
      pending.current = null;
      return;
    }
    const wait = PERSIST_DELAY_MS - (performance.now() - lastWrite.current);
    if (wait <= 0) {
      pending.current = null;
      write.current(value);
      return;
    }
    pending.current = { value };
    const timer = setTimeout(() => {
      const next = pending.current;
      pending.current = null;
      if (next !== null) write.current(next.value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const flush = () => {
      const next = pending.current;
      pending.current = null;
      if (next !== null) write.current(next.value);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);
}
