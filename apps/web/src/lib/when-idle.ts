import { useEffect, useState } from "react";

let idle: Promise<void> | undefined;

/**
 * Resolves once the page has loaded and the main thread is idle, so code that Home doesn't
 * show (the shortcut sheet, the rest of the fonts) loads after first paint instead of with it.
 */
export function whenIdle(): Promise<void> {
  idle ??= new Promise<void>((resolve) => {
    const onIdle = () => {
      if (typeof requestIdleCallback === "function")
        requestIdleCallback(() => resolve(), { timeout: 2000 });
      else setTimeout(resolve, 50);
    };
    if (document.readyState === "complete") onIdle();
    else window.addEventListener("load", onIdle, { once: true });
  });
  return idle;
}

/** False until `whenIdle` resolves. */
export function useIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void whenIdle().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
