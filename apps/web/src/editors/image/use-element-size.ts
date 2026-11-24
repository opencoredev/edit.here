import { useLayoutEffect, useState, type RefObject } from "react";

export type ElementSize = { readonly width: number; readonly height: number };

/** Content-box size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Largest size with `aspect` that fits inside `box`. */
export function fitInside(aspect: ElementSize, box: ElementSize): ElementSize {
  if (aspect.width <= 0 || aspect.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / aspect.width, box.height / aspect.height);
  return { width: aspect.width * scale, height: aspect.height * scale };
}
