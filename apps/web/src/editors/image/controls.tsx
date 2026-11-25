import { memo, type ReactNode } from "react";
import { Slider, Switch, Toggle, ToggleGroup } from "../../components/graphical/index";

/** Single-choice segmented control on the themed ToggleGroup. Never ends up empty. */
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
  isValue,
  className = "flex w-full flex-wrap",
  itemClassName,
  labelClassName,
  iconClassName,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string; icon?: ReactNode; title?: string }[];
  onChange: (value: Value) => void;
  isValue: (value: unknown) => value is Value;
  /** Layout of the group; defaults to filling its row. */
  className?: string;
  /** Extra classes on each option button, e.g. mobile minimum touch-target size. */
  itemClassName?: string;
  /** Classes for each option's text, e.g. `max-sm:sr-only` to show only icons on phones. */
  labelClassName?: string;
  /** Classes for each option's icon wrapper, e.g. `max-sm:hidden` to show only text on phones. */
  iconClassName?: string;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const [picked] = next;
        if (isValue(picked) && picked !== value) onChange(picked);
      }}
      className={className}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          aria-label={option.title ?? option.label}
          className={[
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap",
            itemClassName ?? "",
          ].join(" ")}
        >
          {option.icon === undefined ? null : iconClassName === undefined ? (
            option.icon
          ) : (
            <span className={`contents ${iconClassName}`}>{option.icon}</span>
          )}
          <span className={labelClassName}>{option.label}</span>
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export function LabeledSwitch({
  label,
  checked,
  onChange,
  hint,
  className = "flex w-full items-center justify-between gap-3",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Switch.Row className={className}>
      <Switch.Label className="flex items-center gap-2">
        {label}
        {hint}
      </Switch.Label>
      <Switch.Root checked={checked} onCheckedChange={(next) => onChange(next)}>
        <Switch.Thumb />
      </Switch.Root>
    </Switch.Row>
  );
}

/**
 * One-line slider for the options tray: label, track, value. `onCommit` fires when the drag ends.
 * Memoized, so a tray with several sliders re-renders only the one being dragged when its
 * handlers are stable.
 */
export const InlineSlider = memo(function InlineSlider({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  onCommit,
  className = "w-60",
  labelClassName = "",
  compact = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  className?: string;
  /** Classes for the visible label, e.g. `max-sm:sr-only` where the context names the slider. */
  labelClassName?: string;
  /** A small muted label and a bare number, for trays that fit many controls on one line. */
  compact?: boolean;
}) {
  return (
    <Slider.Root
      value={value}
      min={min}
      max={max}
      onValueChange={(next) => onChange(next)}
      onValueCommitted={(next) => onCommit(next)}
      className={`min-w-0 flex-row items-center ${compact ? "gap-2" : "gap-3"} max-sm:gap-2 ${className}`}
    >
      <Slider.Label
        className={[
          "m-0! shrink-0 max-sm:min-w-0 max-sm:text-xs",
          compact ? "min-w-0! text-xs! font-normal! text-ink-muted!" : "min-w-15",
          labelClassName,
        ].join(" ")}
      >
        {label}
      </Slider.Label>
      <Slider.Control className="min-w-0 flex-1">
        <Slider.Track>
          <Slider.Indicator />
          <Slider.Thumb aria-label={label} />
        </Slider.Track>
      </Slider.Control>
      <span
        className={[
          "timecode shrink-0 text-end text-xs text-ink-muted max-sm:w-7",
          compact ? "w-7" : "w-14",
        ].join(" ")}
      >
        {Math.round(value)}
        {unit === undefined || compact ? null : <span className="max-sm:hidden"> {unit}</span>}
      </span>
    </Slider.Root>
  );
});
