import {
  ANNOTATION_COLORS,
  annotationOrder,
  annotationPixelRange,
  annotationSizeFromPixels,
  annotationSizeToPixels,
  BACKGROUND_PRESETS,
  customBackgroundCss,
  isDrawingTool,
  maxLayerRadius,
  selectedAnnotation,
  type AnnotationStyle,
  type ImageAnnotation,
  type ImageLayer,
  type StrokeKind,
  type KeybindAction,
  type BackgroundPreset,
  type CustomBackgroundMode,
  type FrameConfig,
  type ImageDocumentState,
  type ImageSize,
  type ImageTool,
  type RedactionStyle,
} from "@edit-here/core";
import {
  ArrowDataTransferHorizontalIcon,
  ArrowUpRight01Icon,
  BlurIcon,
  CenterFocusIcon,
  CropIcon,
  Cursor01Icon,
  Delete02Icon,
  Copy01Icon,
  FlipHorizontalIcon,
  GridIcon,
  HighlighterIcon,
  ImageAdd01Icon,
  LayerBringForwardIcon,
  LayerSendBackwardIcon,
  PencilIcon,
  RotateClockwiseIcon,
  RotateLeft01Icon,
  SquareIcon,
  TextIcon,
  Tick02Icon,
  TransparencyIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Input, Popover } from "../../components/graphical/index";
import { Icon, type IconSvgElement } from "../../components/Icon";
import {
  DockBar,
  DockDivider,
  FadeScroller,
  PhoneScroller,
  TrayGroup,
  TrayRow,
} from "../../components/EditorFrame";
import { HintButton } from "../../components/HintButton";
import type { Platform } from "../../lib/platform";
import { numberedHint } from "../../lib/tool-keys";
import { useIsNarrow } from "../../lib/use-is-narrow";
import { ASPECT_PRESETS, isAspectPreset, type AspectPreset } from "./aspect";
import { InlineSlider, Segmented } from "./controls";

const STYLES = ["pixelate", "blur", "blackout"] as const satisfies readonly RedactionStyle[];
const isStyle = (value: unknown): value is RedactionStyle => STYLES.some((s) => s === value);

const SWATCHES = [
  "hyper",
  "ember",
  "mojave",
  "emerald",
  "iris",
  "obsidian",
  "silver",
  "paper",
] as const satisfies readonly Exclude<BackgroundPreset, "none" | "custom">[];

const CUSTOM_MODES = ["gradient", "solid"] as const satisfies readonly CustomBackgroundMode[];
const isCustomMode = (value: unknown): value is CustomBackgroundMode =>
  CUSTOM_MODES.some((m) => m === value);

const ANGLES = ["135", "90", "180", "45"] as const;
type AngleOption = (typeof ANGLES)[number];
const isAngle = (value: unknown): value is AngleOption => ANGLES.some((a) => a === value);

const HEX = /^#[0-9a-f]{6}$/i;
const RAINBOW = "conic-gradient(#ff3b30, #ffcc00, #34c759, #0a84ff, #af52de, #ff3b30)";

/** Swatches light enough that their check mark needs to be dark. */
const LIGHT_COLORS: ReadonlySet<string> = new Set(["#ffffff", "#ffcc00"]);

type ToolButton = {
  readonly tool: ImageTool;
  readonly label: string;
  /** One word under the icon on phones. */
  readonly short: string;
  /** The tool's catalog entry: its first key is the number badge, the second the letter alias. */
  readonly action: ToolAction;
  readonly glyph: IconSvgElement;
};

type ToolAction = Extract<KeybindAction, `image.${ImageTool}`>;

const DRAW_TOOLS: readonly ToolButton[] = [
  {
    tool: "select",
    label: "Select and move",
    short: "Select",
    action: "image.select",
    glyph: Cursor01Icon,
  },
  { tool: "pen", label: "Pen", short: "Pen", action: "image.pen", glyph: PencilIcon },
  {
    tool: "highlighter",
    label: "Highlighter",
    short: "Mark",
    action: "image.highlighter",
    glyph: HighlighterIcon,
  },
  {
    tool: "arrow",
    label: "Arrow",
    short: "Arrow",
    action: "image.arrow",
    glyph: ArrowUpRight01Icon,
  },
  {
    tool: "rectangle",
    label: "Rectangle",
    short: "Box",
    action: "image.rectangle",
    glyph: SquareIcon,
  },
  { tool: "text", label: "Text", short: "Text", action: "image.text", glyph: TextIcon },
];

const IMAGE_TOOLS: readonly ToolButton[] = [
  {
    tool: "redact",
    label: "Redact",
    short: "Redact",
    action: "image.redact",
    glyph: ViewOffSlashIcon,
  },
  { tool: "crop", label: "Crop", short: "Crop", action: "image.crop", glyph: CropIcon },
  {
    tool: "frame",
    label: "Frame and background",
    short: "Frame",
    action: "image.frame",
    glyph: CenterFocusIcon,
  },
];

const TRAY_LABELS: Readonly<Record<ImageTool, string>> = {
  select: "Selection",
  pen: "Pen options",
  highlighter: "Highlighter options",
  arrow: "Arrow options",
  rectangle: "Rectangle options",
  text: "Text options",
  crop: "Crop options",
  redact: "Redaction options",
  frame: "Frame options",
};

export type ImageDockProps = {
  state: ImageDocumentState;
  platform: Platform;
  /** The base image's full size; drawing sizes and layer radii are in its pixels. */
  sourceSize: ImageSize;
  cropSize: ImageSize;
  aspect: AspectPreset;
  onAspect: (aspect: AspectPreset) => void;
  onTool: (tool: ImageTool) => void;
  onRotate: () => void;
  onFlip: () => void;
  onReset: () => void;
  onFinishCrop: () => void;
  onRedactionStyle: (style: RedactionStyle) => void;
  onIntensity: (value: number, phase: "live" | "commit") => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onLayerRadius: (radius: number, phase: "live" | "commit") => void;
  onAddImage: () => void;
  onAnnotationStyle: (patch: Partial<AnnotationStyle>, phase: "live" | "commit") => void;
  onFrame: (patch: Partial<FrameConfig>, phase: "live" | "commit") => void;
  onTransparent: (transparent: boolean) => void;
  /**
   * What the crop tool can crop: the base image first, then each picture on the canvas. Only
   * shown as a choice when there is more than one.
   */
  cropTargets: readonly CropTargetOption[];
  /** The `value` of the target being cropped. */
  cropTarget: string;
  onCropTarget: (value: string) => void;
  /** Shows the whole of the cropped target again. */
  onResetCrop: () => void;
  /** False when the target already shows all of itself. */
  cropResettable: boolean;
};

export type CropTargetOption = { readonly value: string; readonly label: string };

/** The image tool bar: drawing tools, image tools, then orientation. */
export function ImageToolBar(props: ImageDockProps) {
  const { state, platform } = props;
  const toolButton = ({ tool, label, short, action, glyph }: ToolButton) => (
    <HintButton
      key={tool}
      label={label}
      mobileLabel={short}
      icon={<Icon icon={glyph} className="size-4" />}
      onClick={() => props.onTool(tool)}
      {...numberedHint(action)}
      platform={platform}
      pressed={state.tool === tool}
      variant={state.tool === tool ? "secondary" : "ghost"}
    />
  );
  return (
    <DockBar label="Image tools">
      {DRAW_TOOLS.map(toolButton)}
      <DockDivider />
      {IMAGE_TOOLS.map(toolButton)}
      <HintButton
        label="Add image to canvas"
        mobileLabel="Add"
        icon={<Icon icon={ImageAdd01Icon} className="size-4" />}
        onClick={props.onAddImage}
        platform={platform}
      />
      <DockDivider />
      <HintButton
        label="Rotate 90°"
        mobileLabel="Rotate"
        icon={<Icon icon={RotateClockwiseIcon} className="size-4" />}
        onClick={props.onRotate}
        combo="Shift+R"
        platform={platform}
      />
      <HintButton
        label="Flip horizontally"
        mobileLabel="Flip"
        icon={<Icon icon={FlipHorizontalIcon} className="size-4" />}
        onClick={props.onFlip}
        combo="f"
        platform={platform}
      />
      <HintButton
        label="Reset crop, rotation and flip"
        mobileLabel="Reset"
        icon={<Icon icon={RotateLeft01Icon} className="size-4" />}
        onClick={props.onReset}
        combo="0"
        platform={platform}
      />
    </DockBar>
  );
}

/** Label for the options row of the active tool. */
export function imageOptionsLabel(tool: ImageTool): string {
  return TRAY_LABELS[tool];
}

/** Whether the active tool shows an options row. Select shows one only for a selection. */
export function hasImageOptions(state: ImageDocumentState): boolean {
  if (state.tool === "select") return state.selectedAnnotationId !== null;
  return true;
}

/** The active tool's options. */
export function ImageOptions(props: ImageDockProps) {
  const { state } = props;
  const selected = selectedAnnotation(state);
  if (selected?.kind === "image") return <LayerOptions {...props} layer={selected} />;
  if (state.tool === "select" || isDrawingTool(state.tool)) return <DrawingOptions {...props} />;
  switch (state.tool) {
    case "crop":
      return <CropOptions {...props} />;
    case "redact":
      return <RedactOptions {...props} />;
    case "frame":
      return <FrameOptions {...props} />;
    default: {
      const _exhaustive: never = state.tool;
      return _exhaustive;
    }
  }
}

const KIND_LABELS: Readonly<Record<ImageAnnotation["kind"], string>> = {
  pen: "Pen",
  highlighter: "Highlighter",
  arrow: "Arrow",
  rectangle: "Rect",
  text: "Text",
  image: "Image",
};

/** Names what the options act on: the selected element, or the tool's next drawing. */
function EditingBadge({ kind, selected }: { kind: ImageAnnotation["kind"]; selected: boolean }) {
  return (
    <span
      className={[
        "flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-medium whitespace-nowrap",
        selected ? "bg-brand/12 text-brand" : "bg-n3 text-ink",
        // Phones have little room in the tray; the selection box on the canvas shows the same.
        "max-sm:hidden",
      ].join(" ")}
    >
      {selected ? (
        <>
          <span>Selected</span>
          <span aria-hidden="true" className="opacity-60">
            ·
          </span>
        </>
      ) : null}
      {KIND_LABELS[kind]}
    </span>
  );
}

/** Order, duplicate and delete for the selected element. */
function SelectionActions({
  state,
  id,
  platform,
  onBringForward,
  onSendBackward,
  onDuplicateSelected,
  onDeleteSelected,
}: ImageDockProps & { id: string }) {
  const order = annotationOrder(state, id);
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <span className="contents max-sm:hidden">
        <HintButton
          label="Send backward"
          icon={<Icon icon={LayerSendBackwardIcon} className="size-4" />}
          onClick={onSendBackward}
          combo="Mod+["
          platform={platform}
          disabled={order.atBack}
        />
        <HintButton
          label="Bring forward"
          icon={<Icon icon={LayerBringForwardIcon} className="size-4" />}
          onClick={onBringForward}
          combo="Mod+]"
          platform={platform}
          disabled={order.atFront}
        />
      </span>
      <HintButton
        label="Duplicate"
        icon={<Icon icon={Copy01Icon} className="size-4" />}
        onClick={onDuplicateSelected}
        combo="Mod+D"
        platform={platform}
        className="max-sm:size-10!"
      />
      <HintButton
        label="Delete"
        icon={<Icon icon={Delete02Icon} className="size-4" />}
        onClick={onDeleteSelected}
        combo="Backspace"
        platform={platform}
        className="max-sm:size-10!"
      />
    </div>
  );
}

function DrawingOptions(props: ImageDockProps) {
  const { state, onAnnotationStyle, sourceSize } = props;
  const selected = selectedAnnotation(state);
  const stroke = selected !== null && selected.kind !== "image" ? selected : null;
  // With a drawing selected in select mode, the controls show and change that drawing.
  const style: AnnotationStyle = stroke ?? state.annotationStyle;
  const kind: StrokeKind | null = stroke?.kind ?? (isDrawingTool(state.tool) ? state.tool : null);
  const custom = !ANNOTATION_COLORS.some((c) => c.hex === style.color);
  const longEdge = Math.max(sourceSize.width, sourceSize.height);
  // Select mode with nothing selected shows no tray; this covers the type.
  const sizeKind: StrokeKind = kind ?? "pen";
  const range = annotationPixelRange({ kind: sizeKind, longEdge });
  const sizePx = Math.round(annotationSizeToPixels({ size: style.size, kind: sizeKind, longEdge }));
  const toSize = (pixels: number) => annotationSizeFromPixels({ pixels, kind: sizeKind, longEdge });
  return (
    <TrayRow>
      {kind === null ? null : <EditingBadge kind={kind} selected={stroke !== null} />}
      <TrayGroup label="Color" className="max-sm:flex-1">
        <PhoneScroller>
          <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Color">
            {ANNOTATION_COLORS.map((color) => {
              const checked = style.color === color.hex;
              return (
                <button
                  key={color.hex}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={color.label}
                  title={color.label}
                  onClick={() => onAnnotationStyle({ color: color.hex }, "commit")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-n3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand max-sm:size-[34px]"
                >
                  <span
                    className="flex size-5 items-center justify-center rounded-full shadow-[var(--border-shadow-s)] max-sm:size-[22px]"
                    style={{ background: color.hex }}
                  >
                    {checked ? (
                      <Icon
                        icon={Tick02Icon}
                        className="size-3"
                        // Contrast against the swatch's own (content) color, not the theme.
                        style={{ color: LIGHT_COLORS.has(color.hex) ? "#1c1c1e" : "#ffffff" }}
                        strokeWidth={3}
                      />
                    ) : null}
                  </span>
                </button>
              );
            })}
            <label
              title="Custom color"
              className="relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-n3 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-brand max-sm:size-[34px]"
            >
              <span className="sr-only">Custom color</span>
              <span
                aria-hidden="true"
                className={[
                  "size-5 rounded-full shadow-[var(--border-shadow-s)] max-sm:size-[22px]",
                  custom ? "outline-2 outline-offset-1 outline-brand" : "",
                ].join(" ")}
                style={{ background: custom ? style.color : RAINBOW }}
              />
              <input
                type="color"
                value={style.color}
                onChange={(event) =>
                  onAnnotationStyle({ color: event.currentTarget.value }, "live")
                }
                onBlur={(event) =>
                  onAnnotationStyle({ color: event.currentTarget.value }, "commit")
                }
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </PhoneScroller>
      </TrayGroup>
      <DockDivider className="max-sm:hidden" />
      <InlineSlider
        label={sizeKind === "text" ? "Font" : "Size"}
        value={Math.min(range.max, Math.max(range.min, sizePx))}
        min={range.min}
        max={range.max}
        unit="px"
        labelClassName="min-w-0! text-xs! font-normal! text-ink-muted! max-sm:sr-only"
        className="w-48 max-sm:w-28 max-sm:shrink-0"
        onChange={(pixels) => onAnnotationStyle({ size: toSize(pixels) }, "live")}
        onCommit={(pixels) => onAnnotationStyle({ size: toSize(pixels) }, "commit")}
      />
      {stroke === null ? null : (
        <>
          <DockDivider className="max-sm:hidden" />
          <SelectionActions {...props} id={stroke.id} />
        </>
      )}
    </TrayRow>
  );
}

/** Options for a selected image layer: corner radius, order, duplicate, delete. */
function LayerOptions(props: ImageDockProps & { layer: ImageLayer }) {
  const { layer, sourceSize, onLayerRadius } = props;
  const max = Math.max(0, Math.min(48, maxLayerRadius(layer, sourceSize)));
  return (
    <TrayRow>
      <EditingBadge kind="image" selected />
      <InlineSlider
        label="Radius"
        value={Math.min(max, layer.radius)}
        min={0}
        max={max}
        unit="px"
        className="w-52 max-sm:w-auto max-sm:flex-1"
        labelClassName="min-w-0! text-xs! font-normal! text-ink-muted! max-sm:sr-only"
        onChange={(next) => onLayerRadius(next, "live")}
        onCommit={(next) => onLayerRadius(next, "commit")}
      />
      <DockDivider className="max-sm:hidden" />
      <SelectionActions {...props} id={layer.id} />
    </TrayRow>
  );
}

function CropOptions({
  aspect,
  onAspect,
  cropSize,
  onFinishCrop,
  platform,
  cropTargets,
  cropTarget,
  onCropTarget,
  onResetCrop,
  cropResettable,
}: ImageDockProps) {
  const narrow = useIsNarrow();
  const isTarget = (value: unknown): value is string =>
    typeof value === "string" && cropTargets.some((t) => t.value === value);
  const targets =
    cropTargets.length < 2 ? null : (
      <TrayGroup label="Crop" className="max-sm:flex-1">
        <PhoneScroller>
          <Segmented
            label="Image to crop"
            value={cropTarget}
            isValue={isTarget}
            onChange={onCropTarget}
            className="flex"
            options={cropTargets}
          />
        </PhoneScroller>
      </TrayGroup>
    );
  const aspectGroup = (
    <TrayGroup label="Aspect" className="max-sm:flex-1">
      <PhoneScroller>
        <Segmented
          label="Aspect ratio"
          value={aspect}
          isValue={isAspectPreset}
          onChange={onAspect}
          className="flex"
          options={ASPECT_PRESETS.map((preset) => ({
            value: preset,
            label: preset === "free" ? "Free" : preset,
          }))}
        />
      </PhoneScroller>
    </TrayGroup>
  );
  const reset = (
    <HintButton
      label="Reset crop"
      showLabel={!narrow}
      icon={<Icon icon={RotateLeft01Icon} className="size-4" />}
      onClick={onResetCrop}
      disabled={!cropResettable}
      platform={platform}
      className="max-sm:size-10!"
    />
  );
  const done = (
    <HintButton
      label="Done"
      showLabel
      variant={narrow ? "primary" : "ghost"}
      icon={<Icon icon={Tick02Icon} className="size-4" />}
      onClick={onFinishCrop}
      combo="Enter"
      platform={platform}
    />
  );
  if (narrow && targets !== null) {
    // Phones: which image on its own line, so the aspect presets keep their room.
    return (
      <div className="flex flex-col gap-1.5">
        <TrayRow>{targets}</TrayRow>
        <TrayRow>
          {aspectGroup}
          {reset}
          {done}
        </TrayRow>
      </div>
    );
  }
  return (
    <TrayRow>
      {targets}
      {targets === null ? null : <DockDivider className="max-sm:hidden" />}
      {aspectGroup}
      <output
        className="timecode min-w-[13ch] text-xs text-ink-muted max-sm:hidden"
        aria-live="polite"
        aria-label="Crop size"
      >
        {cropSize.width} × {cropSize.height} px
      </output>
      <DockDivider className="max-sm:hidden" />
      {reset}
      {done}
    </TrayRow>
  );
}

function RedactOptions(props: ImageDockProps) {
  const { state, onRedactionStyle, onIntensity, onDeleteSelected, platform } = props;
  const selected = state.redactions.find((r) => r.id === state.selectedRedactionId) ?? null;
  return (
    <TrayRow>
      <TrayGroup label={selected === null ? "Style" : "Box"} className="shrink-0">
        <Segmented
          label="Redaction style"
          value={selected?.style ?? state.redactionStyle}
          isValue={isStyle}
          onChange={onRedactionStyle}
          className="flex"
          iconClassName="max-sm:hidden"
          options={[
            {
              value: "pixelate",
              label: "Pixels",
              title: "Pixelate",
              icon: <Icon icon={GridIcon} className="size-4" />,
            },
            {
              value: "blur",
              label: "Blur",
              icon: <Icon icon={BlurIcon} className="size-4" />,
            },
            {
              value: "blackout",
              label: "Black",
              title: "Blackout",
              icon: <Icon icon={SquareIcon} className="size-4" />,
            },
          ]}
        />
      </TrayGroup>
      {selected !== null && selected.style !== "blackout" ? (
        <InlineSlider
          label="Strength"
          value={Math.round(selected.intensity * 100)}
          min={0}
          max={100}
          unit="%"
          labelClassName="max-sm:sr-only"
          className="w-64 max-sm:w-auto max-sm:flex-1"
          onChange={(v) => onIntensity(v / 100, "live")}
          onCommit={(v) => onIntensity(v / 100, "commit")}
        />
      ) : null}
      {selected === null ? (
        <span className="text-xs text-ink-muted max-sm:hidden">
          {state.redactions.length === 0
            ? "Drag across the image to cover an area"
            : "Click a box to change it"}
        </span>
      ) : (
        <HintButton
          label="Delete box"
          showLabel
          labelClassName="max-sm:hidden"
          icon={<Icon icon={Delete02Icon} className="size-4" />}
          onClick={onDeleteSelected}
          combo="Backspace"
          platform={platform}
        />
      )}
    </TrayRow>
  );
}

/** A small "drop shadow" mark: a square with a filled square offset behind it. */
function ShadowGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
      <rect x="4.5" y="4.5" width="9.5" height="9.5" rx="2" fill="currentColor" opacity="0.35" />
      <rect
        x="2"
        y="2"
        width="9.5"
        height="9.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * Frame options in one line: the backgrounds (None first, which turns the frame off), padding
 * and radius, then Shadow while a frame is on, or Transparent while it is off (a frame always
 * paints its own background, so transparency only applies without one).
 */
function FrameOptions({ state, onFrame, onTransparent, platform }: ImageDockProps) {
  const narrow = useIsNarrow();
  const { frame } = state;
  const live = (patch: Partial<FrameConfig>) => onFrame({ ...patch, enabled: true }, "live");
  const commit = (patch: Partial<FrameConfig>) => onFrame({ ...patch, enabled: true }, "commit");
  const swatches = (
    <div className="flex shrink-0 items-center gap-1.5" role="radiogroup" aria-label="Background">
      <button
        type="button"
        role="radio"
        aria-checked={!frame.enabled}
        aria-label="No frame"
        title="No frame"
        onClick={() => onFrame({ enabled: false }, "commit")}
        className={`${SWATCH_CLASS} swatch-none`}
      />
      {SWATCHES.map((preset) => (
        <button
          key={preset}
          type="button"
          role="radio"
          aria-checked={frame.enabled && frame.preset === preset}
          aria-label={BACKGROUND_PRESETS[preset].label}
          title={BACKGROUND_PRESETS[preset].label}
          onClick={() => commit({ preset })}
          className={SWATCH_CLASS}
          style={{ background: BACKGROUND_PRESETS[preset].css }}
        />
      ))}
      <CustomBackground
        frame={frame}
        narrow={narrow}
        platform={platform}
        live={live}
        commit={commit}
      />
    </div>
  );
  const padding = (
    <InlineSlider
      label="Padding"
      value={frame.padding}
      min={0}
      max={512}
      compact
      className="w-36 max-sm:w-auto"
      onChange={(next) => live({ padding: next })}
      onCommit={(next) => commit({ padding: next })}
    />
  );
  const radius = (
    <InlineSlider
      label="Radius"
      value={frame.radius}
      min={0}
      max={128}
      compact
      className="w-32 max-sm:w-auto"
      onChange={(next) => live({ radius: next })}
      onCommit={(next) => commit({ radius: next })}
    />
  );
  const toggle = frame.enabled ? (
    <HintButton
      label="Shadow"
      showLabel
      icon={<ShadowGlyph />}
      pressed={frame.shadow}
      variant={frame.shadow ? "secondary" : "ghost"}
      onClick={() => commit({ shadow: !frame.shadow })}
      platform={platform}
    />
  ) : (
    <HintButton
      label="Transparent"
      showLabel
      icon={<Icon icon={TransparencyIcon} className="size-4" />}
      pressed={state.transparent}
      variant={state.transparent ? "secondary" : "ghost"}
      onClick={() => onTransparent(!state.transparent)}
      combo="t"
      platform={platform}
    />
  );
  const jpegNote =
    !frame.enabled && state.exportFormat === "image/jpeg" && state.transparent ? (
      <p className="text-xs text-ink-muted">JPEG has no transparency, so the background is kept.</p>
    ) : null;

  if (narrow) {
    // Phones: swipeable backgrounds with the toggle pinned beside them (outside the scroller,
    // which would otherwise scroll to the pressed toggle and hide None), sliders below.
    return (
      <div className="flex flex-col gap-1.5 py-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <FadeScroller className="flex-1" innerClassName="gap-2 px-1 py-1">
            {swatches}
          </FadeScroller>
          <DockDivider />
          {toggle}
        </div>
        <div className="grid grid-cols-2 gap-3 px-1">
          {padding}
          {radius}
        </div>
        {jpegNote}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <TrayRow>
        {swatches}
        <DockDivider />
        {padding}
        {radius}
        <DockDivider />
        {toggle}
      </TrayRow>
      {jpegNote}
    </div>
  );
}

const SWATCH_CLASS =
  "size-[22px] shrink-0 rounded-sm shadow-[var(--border-shadow-s)] outline-offset-2 transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-brand aria-checked:outline-2 aria-checked:outline-brand aria-expanded:outline-2 aria-expanded:outline-brand motion-reduce:transition-none max-sm:size-7";

type FramePatch = (patch: Partial<FrameConfig>) => void;

/**
 * The Custom swatch: opening it switches the frame to the custom background, and its popover
 * picks a solid color or a two-color gradient with live preview.
 */
function CustomBackground({
  frame,
  narrow,
  platform,
  live,
  commit,
}: {
  frame: FrameConfig;
  narrow: boolean;
  platform: Platform;
  live: FramePatch;
  commit: FramePatch;
}) {
  const selected = frame.enabled && frame.preset === "custom";
  const css = customBackgroundCss(frame);
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open && !selected) commit({ preset: "custom" });
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label="Custom background"
            title="Custom background"
            aria-pressed={selected}
            className={`${SWATCH_CLASS} aria-pressed:outline-2 aria-pressed:outline-brand`}
            style={{ background: selected ? css : RAINBOW }}
          />
        }
      />
      <Popover.Portal>
        <Popover.Positioner side={narrow ? "top" : "bottom"} sideOffset={10} collisionPadding={10}>
          <Popover.Popup className="w-[328px] max-w-[calc(100vw-20px)] gap-3!">
            <div className="flex items-center justify-between gap-3">
              <Popover.Title className="text-sm font-medium text-ink">
                Custom background
              </Popover.Title>
              <span
                aria-hidden="true"
                className="h-6 w-10 shrink-0 rounded-sm shadow-[var(--border-shadow-s)]"
                style={{ background: css }}
              />
            </div>
            <Segmented
              label="Fill"
              value={frame.customMode}
              isValue={isCustomMode}
              onChange={(customMode) => commit({ preset: "custom", customMode })}
              className="flex w-full"
              options={[
                { value: "gradient", label: "Gradient" },
                { value: "solid", label: "Solid" },
              ]}
            />
            {frame.customMode === "solid" ? (
              <ColorField
                label="Color"
                value={frame.customColor}
                onLive={(customColor) => live({ preset: "custom", customColor })}
                onCommit={(customColor) => commit({ preset: "custom", customColor })}
              />
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <ColorField
                    label="From"
                    value={frame.customColor}
                    onLive={(customColor) => live({ preset: "custom", customColor })}
                    onCommit={(customColor) => commit({ preset: "custom", customColor })}
                  />
                  <HintButton
                    label="Swap colors"
                    platform={platform}
                    icon={<Icon icon={ArrowDataTransferHorizontalIcon} className="size-4" />}
                    onClick={() =>
                      commit({
                        preset: "custom",
                        customColor: frame.customColorEnd,
                        customColorEnd: frame.customColor,
                      })
                    }
                  />
                  <ColorField
                    label="To"
                    value={frame.customColorEnd}
                    onLive={(customColorEnd) => live({ preset: "custom", customColorEnd })}
                    onCommit={(customColorEnd) => commit({ preset: "custom", customColorEnd })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-ink-muted">Angle</span>
                  <Segmented
                    label="Gradient angle"
                    value={isAngle(String(frame.customAngle)) ? String(frame.customAngle) : "135"}
                    isValue={isAngle}
                    onChange={(angle) => commit({ preset: "custom", customAngle: Number(angle) })}
                    className="flex w-full"
                    options={ANGLES.map((angle) => ({ value: angle, label: `${angle}°` }))}
                  />
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A color well plus an editable hex field. Picks preview live and commit on release or blur. */
function ColorField({
  label,
  value,
  onLive,
  onCommit,
}: {
  label: string;
  value: string;
  onLive: (hex: string) => void;
  onCommit: (hex: string) => void;
}) {
  // The typed text while the field is being edited; otherwise the field shows `value`.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <label
          title={`${label} color`}
          className="relative size-8 shrink-0 cursor-pointer rounded-sm shadow-[var(--border-shadow-s)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
          style={{ background: value }}
        >
          <span className="sr-only">{label} color</span>
          <input
            type="color"
            value={value}
            onChange={(event) => onLive(event.currentTarget.value)}
            onBlur={(event) => onCommit(event.currentTarget.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          aria-label={`${label} hex`}
          value={draft ?? value}
          spellCheck={false}
          maxLength={7}
          // 16px on touch screens: iOS Safari zooms the page into a focused field set smaller.
          className="timecode min-w-0 flex-1 px-2! text-xs uppercase pointer-coarse:text-base"
          onChange={(event) => {
            const next = event.currentTarget.value.trim();
            const hex = next.startsWith("#") ? next : `#${next}`;
            setDraft(hex);
            if (HEX.test(hex)) onLive(hex.toLowerCase());
          }}
          onBlur={() => {
            if (draft !== null && HEX.test(draft)) onCommit(draft.toLowerCase());
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}
