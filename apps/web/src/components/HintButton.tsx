import type { KeyCombo } from "@edit-here/core";
import type { ReactNode } from "react";
import { Button, Tooltip, type ButtonVariant } from "./graphical/index";
import type { Platform } from "../lib/platform";
import { useIsNarrow } from "../lib/use-is-narrow";
import { Keys } from "./Keys";

type HintButtonProps = {
  /** Accessible name and tooltip text. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  platform: Platform;
  combo?: KeyCombo;
  /** A second shortcut shown in the tooltip, e.g. the letter alias of a numbered tool. */
  altCombo?: KeyCombo | undefined;
  /**
   * A short key hint drawn in the button's bottom-right corner on desktop, e.g. the tool's
   * number. Phone tiles never show it.
   */
  badge?: string | undefined;
  disabled?: boolean;
  /** Show `label` next to the icon. Icon-only buttons still get the label as their name. */
  showLabel?: boolean;
  /** Classes for the visible label, e.g. `hidden sm:inline` to drop it on phones. */
  labelClassName?: string;
  /**
   * One short word shown under the icon on phones, where the button becomes a labeled tile for
   * a tool rail (phones have no hover tooltips). Leave it out to keep the compact button.
   */
  mobileLabel?: string;
  /** Extra classes for the compact button, e.g. a larger tap target on phones. */
  className?: string;
  variant?: ButtonVariant;
  pressed?: boolean;
};

/** A toolbar button with a tooltip that names the action and its shortcut. */
export function HintButton({
  label,
  icon,
  onClick,
  platform,
  combo,
  altCombo,
  badge,
  disabled = false,
  showLabel = false,
  labelClassName,
  mobileLabel,
  className,
  variant = "ghost",
  pressed,
}: HintButtonProps) {
  const narrow = useIsNarrow();
  if (narrow && mobileLabel !== undefined) {
    return (
      <ToolTile
        label={label}
        mobileLabel={mobileLabel}
        icon={icon}
        onClick={onClick}
        disabled={disabled}
        pressed={pressed}
      />
    );
  }
  const labelled = showLabel && labelClassName === undefined;
  const classes = [
    showLabel && labelClassName !== undefined ? "max-sm:px-2!" : "",
    badge === undefined ? "" : "relative min-w-8",
    className ?? "",
  ]
    .join(" ")
    .trim();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            variant={variant}
            onClick={onClick}
            disabled={disabled}
            aria-label={labelled ? undefined : label}
            aria-pressed={pressed}
            // Icon-only buttons are square: horizontal padding matches the theme's vertical xs.
            style={showLabel ? undefined : { paddingInline: "var(--space-xs)" }}
            className={classes === "" ? undefined : classes}
          />
        }
      >
        {icon}
        {showLabel ? <span className={labelClassName}>{label}</span> : null}
        {badge === undefined ? null : (
          <span
            aria-hidden="true"
            className={[
              "pointer-events-none absolute right-[3px] bottom-[2px] font-mono text-[9px] leading-none font-medium tabular-nums max-sm:hidden",
              pressed === true ? "text-ink" : "text-ink-muted",
            ].join(" ")}
          >
            {badge}
          </span>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup className="flex items-center gap-2">
            <span>{label}</span>
            {combo === undefined ? null : <Keys combo={combo} platform={platform} />}
            {altCombo === undefined ? null : (
              <>
                <span className="text-ink-muted">or</span>
                <Keys combo={altCombo} platform={platform} />
              </>
            )}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * Phone tool tile: icon over a one-word caption, sized for a thumb. The active tool gets a
 * brand-tinted pill, like the selected tool in iOS Markup.
 */
export function ToolTile({
  label,
  mobileLabel,
  icon,
  onClick,
  disabled = false,
  pressed,
}: {
  label: string;
  mobileLabel: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean | undefined;
}) {
  const accessibleLabel =
    label === mobileLabel
      ? undefined
      : label.toLowerCase().includes(mobileLabel.toLowerCase())
        ? label
        : `${mobileLabel}, ${label.toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={accessibleLabel}
      className="flex h-[50px] min-w-[52px] shrink-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-md px-1.5 text-[10px] leading-none font-medium text-ink-muted transition-colors duration-150 select-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand active:bg-n3 disabled:pointer-events-none disabled:opacity-40 aria-pressed:bg-brand/15 aria-pressed:text-brand [&_svg]:size-5"
    >
      {icon}
      <span aria-hidden={accessibleLabel === undefined ? undefined : true}>{mobileLabel}</span>
    </button>
  );
}
