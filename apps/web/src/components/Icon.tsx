import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { CSSProperties } from "react";

export type { IconSvgElement };

/**
 * App icon: a Hugeicons stroke glyph at a consistent weight. Size it with a `size-*` class
 * (the class wins over the default `size`), color it with `text-*`. Decorative by default;
 * pass `aria-hidden={false}` with an `aria-label` for a meaningful standalone icon.
 */
export function Icon({
  icon,
  className,
  size = 16,
  strokeWidth = 1.75,
  style,
  "aria-hidden": ariaHidden = true,
  "aria-label": ariaLabel,
}: {
  icon: IconSvgElement;
  className?: string | undefined;
  size?: number | undefined;
  /** Heavier strokes only for tiny marks, such as a check inside a 20px swatch. */
  strokeWidth?: number | undefined;
  style?: CSSProperties | undefined;
  "aria-hidden"?: boolean | undefined;
  "aria-label"?: string | undefined;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      {...(style === undefined ? {} : { style })}
      {...(className === undefined ? {} : { className })}
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      aria-hidden={ariaHidden}
      focusable="false"
    />
  );
}
