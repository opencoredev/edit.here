import {
  formatKeyCombo,
  type KeyCombo,
  type LoadedMediaMeta,
  type MediaKind,
} from "@edit-here/core";
import {
  Activity01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Copy01Icon,
  Download01Icon,
  FolderOpenIcon,
  GithubIcon,
  Image01Icon,
  KeyboardIcon,
  Moon02Icon,
  MoreHorizontalIcon,
  Redo02Icon,
  Sun03Icon,
  Tick02Icon,
  Undo02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { Icon, type IconSvgElement } from "./Icon";
import type { EditorToolbarActions, ExportFormatChoice } from "../editors/types";
import { formatBytes, type Platform } from "../lib/platform";
import { REPO_URL } from "../lib/repo";
import { Button, ButtonContent, Menu, Tooltip } from "./graphical/index";
import { HintButton } from "./HintButton";
import { useIsNarrow } from "../lib/use-is-narrow";

const KIND_ICONS: Record<MediaKind, IconSvgElement> = {
  image: Image01Icon,
  video: Video01Icon,
};

type ShellHeaderProps = {
  meta: LoadedMediaMeta | null;
  actions: EditorToolbarActions;
  exporting: boolean;
  /** The last copy landed a moment ago; a `copy` main button says so. */
  copied: boolean;
  colorMode: "dark" | "light";
  platform: Platform;
  onToggleColorMode: () => void;
  onOpenFile: () => void;
  onShowKeybinds: () => void;
  onCloseFile: () => void;
  onCopy: () => void;
  /** Export in `format` (an `exportFormats` option id), or in the selected one. */
  onExport: (format?: string) => void;
  /** Called when any GitHub link in the header is opened. */
  onOpenGitHub?: (() => void) | undefined;
};

function shortcutText(combo: KeyCombo, platform: Platform): string {
  return formatKeyCombo(combo, platform).join(platform === "mac" ? "" : "+");
}

/** 40×40 tap targets for header buttons on phones. */
const PHONE_TAP = "max-sm:size-10! max-sm:px-0!";

const STATUS_URL = "https://status.databuddy.cc/edit-here";

/** An outside link (repo, status page): an icon-only ghost button with the same tooltip as the header's `HintButton`s. */
function ExternalLink({
  href,
  label,
  icon,
  className,
  onOpen,
}: {
  href: string;
  label: string;
  icon: IconSvgElement;
  className?: string;
  onOpen?: (() => void) | undefined;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <Button
            variant="ghost"
            nativeButton={false}
            render={({ role: _role, onKeyDown, onKeyUp, onClick, ...buttonProps }) => (
              <a
                {...buttonProps}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  onClick?.(event);
                  onOpen?.();
                }}
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    return;
                  }
                  onKeyDown?.(event);
                }}
                onKeyUp={(event) => {
                  if (event.key === " ") return;
                  onKeyUp?.(event);
                }}
              />
            )}
            aria-label={label}
            style={{ paddingInline: "var(--space-xs)" }}
            className={className}
          />
        }
      >
        <Icon icon={icon} className="size-4" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="28" height="28" rx="7" className="fill-n3" />
      <rect
        x="8"
        y="8"
        width="16"
        height="16"
        rx="3"
        fill="none"
        className="stroke-brand"
        strokeWidth="2.5"
        strokeDasharray="4.5 3"
      />
      <rect x="12.5" y="12.5" width="7" height="7" rx="1.5" className="fill-brand" />
    </svg>
  );
}

/**
 * Minimal header. Desktop: logo and the open file on the leading side; undo, redo, Copy (when the
 * editor's main action is copy) and the labeled Export split button on the trailing side. Phones
 * with a file open: Close, then undo and redo, then Copy and a "Save" button; the file name moves
 * into the overflow menu. Everything else (copy, open, theme, the GitHub link, and
 * shortcuts on phones) sits in that one menu; desktop keeps GitHub and shortcuts buttons next to
 * undo. Home shows status, GitHub, shortcuts and theme buttons on the trailing side.
 */
export function ShellHeader({
  meta,
  actions,
  exporting,
  copied,
  colorMode,
  platform,
  onToggleColorMode,
  onOpenFile,
  onShowKeybinds,
  onCloseFile,
  onCopy,
  onExport,
  onOpenGitHub,
}: ShellHeaderProps) {
  const kindGlyph = meta === null ? null : KIND_ICONS[meta.kind];
  const exportDisabled = actions.exportFile === undefined || actions.busy === true || exporting;
  const copyDisabled = actions.copy === undefined || actions.busy === true;
  const copyFirst = actions.primaryAction === "copy" && actions.copy !== undefined;
  const exportLabel = actions.exportLabel ?? "Export";
  // Phones have room for one short word; it names the action people look for to keep their edit.
  const saveLabel = useIsNarrow() ? "Save" : exportLabel;
  const themeLabel = colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const themeGlyph = colorMode === "dark" ? Sun03Icon : Moon02Icon;

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 bg-canvas px-2.5 sm:h-13 sm:px-4">
      <a
        href="/"
        aria-label="edit.here home"
        className={[
          "flex items-center gap-2 rounded-sm px-1 py-1 font-semibold tracking-tight text-ink outline-none focus-visible:outline-2 focus-visible:outline-brand",
          meta === null ? "" : "max-sm:hidden",
        ].join(" ")}
        onClick={(event) => {
          if (meta === null) return;
          event.preventDefault();
          onCloseFile();
        }}
      >
        <Logo />
        <span className={meta === null ? undefined : "hidden md:inline"}>edit.here</span>
      </a>

      {meta !== null && kindGlyph !== null ? (
        <>
          <span className="contents sm:hidden">
            <HintButton
              label="Close file"
              icon={<Icon icon={Cancel01Icon} className="size-5" />}
              onClick={onCloseFile}
              platform={platform}
              className={PHONE_TAP}
            />
          </span>
          <div className="flex min-w-0 shrink items-center gap-2 rounded-sm py-1 pr-0.5 pl-2 text-ink-muted hover:bg-n2 max-sm:hidden sm:ml-1">
            <Icon icon={kindGlyph} className="size-4 shrink-0" />
            <span className="min-w-0 max-w-[32ch] truncate text-sm text-ink" title={meta.name}>
              {meta.name}
            </span>
            <span className="timecode text-xs whitespace-nowrap">{formatBytes(meta.size)}</span>
            <HintButton
              label="Close file"
              icon={<Icon icon={Cancel01Icon} className="size-3.5" />}
              onClick={onCloseFile}
              platform={platform}
            />
          </div>
        </>
      ) : null}

      {meta !== null && kindGlyph !== null ? (
        <>
          <div className="flex shrink-0 items-center gap-1 max-sm:mx-auto sm:ml-auto">
            {/* Desktop keeps the repo link and shortcut sheet one click away; phones find them
                in the menu. */}
            <span className="contents max-sm:hidden">
              <ExternalLink
                href={REPO_URL}
                label="View on GitHub"
                icon={GithubIcon}
                onOpen={onOpenGitHub}
              />
              <HintButton
                label="Keyboard shortcuts"
                icon={<Icon icon={KeyboardIcon} className="size-4" />}
                onClick={onShowKeybinds}
                combo="?"
                platform={platform}
              />
            </span>
            <HintButton
              label="Undo"
              icon={<Icon icon={Undo02Icon} className="size-4 max-sm:size-5" />}
              onClick={() => actions.undo?.()}
              disabled={actions.undo === undefined || actions.canUndo !== true}
              combo="Mod+Z"
              platform={platform}
              className={PHONE_TAP}
            />
            <HintButton
              label="Redo"
              icon={<Icon icon={Redo02Icon} className="size-4 max-sm:size-5" />}
              onClick={() => actions.redo?.()}
              disabled={actions.redo === undefined || actions.canRedo !== true}
              combo="Mod+Shift+Z"
              platform={platform}
              className={PHONE_TAP}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {copyFirst ? (
              <Button
                variant="secondary"
                onClick={onCopy}
                disabled={copyDisabled}
                className={`h-8! sm:ml-1 ${PHONE_TAP}`}
                aria-label={copied ? "Copied" : (actions.copyLabel ?? "Copy")}
              >
                <ButtonContent loading={false} contentKey={copied ? "copied" : "copy"}>
                  <Icon icon={copied ? Tick02Icon : Copy01Icon} className="size-4 max-sm:size-5" />
                  {/* Fixed width, so the button doesn't jump between the two words. */}
                  <span className="hidden min-w-[6ch] text-start sm:inline">
                    {copied ? "Copied" : "Copy"}
                  </span>
                </ButtonContent>
              </Button>
            ) : null}
            {/* One machined control: both halves share a height and a single inner divider. */}
            <div className="inline-flex items-stretch sm:ml-1">
              <Button
                variant="primary"
                onClick={() => onExport()}
                disabled={exportDisabled}
                className={[
                  "h-8! max-sm:h-10! max-sm:px-3!",
                  actions.exportFormats === undefined ? "" : "export-split-left",
                ].join(" ")}
                aria-label={saveLabel}
              >
                <ButtonContent loading={exporting} contentKey="export">
                  <Icon icon={Download01Icon} className="size-4 max-sm:size-5" />
                  <span>{saveLabel}</span>
                </ButtonContent>
              </Button>
              {actions.exportFormats === undefined ? null : copyFirst ? (
                <DirectExportMenu
                  choice={actions.exportFormats}
                  disabled={exportDisabled}
                  exporting={exporting}
                  platform={platform}
                  onExport={onExport}
                />
              ) : (
                <ExportFormatMenu
                  choice={actions.exportFormats}
                  disabled={exporting}
                  copyLabel={actions.copy === undefined ? null : (actions.copyLabel ?? "Copy")}
                  copyDisabled={copyDisabled}
                  platform={platform}
                  onCopy={onCopy}
                />
              )}
            </div>
            <Menu.Root>
              <Menu.Trigger
                render={
                  <Button
                    variant="ghost"
                    style={{ paddingInline: "var(--space-xs)" }}
                    className={PHONE_TAP}
                  />
                }
                aria-label="More"
              >
                <Icon icon={MoreHorizontalIcon} className="size-4 max-sm:size-5" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6}>
                  <Menu.Popup className="max-w-[min(20rem,calc(100vw-20px))]">
                    {/* Phones hide the file pill in the header; the open file is named here. */}
                    <div className="flex min-w-0 items-center gap-2 px-2 pt-1 pb-2 sm:hidden">
                      <Icon icon={kindGlyph} className="size-4 shrink-0 text-ink-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{meta.name}</span>
                      <span className="timecode shrink-0 text-xs text-ink-muted">
                        {formatBytes(meta.size)}
                      </span>
                    </div>
                    <Menu.Separator className="sm:hidden" />
                    {/* The main button's other action, so neither is ever more than a menu away. */}
                    {copyFirst ? (
                      <Menu.Item disabled={exportDisabled} onClick={() => onExport()}>
                        <Menu.ItemContent
                          icon={<Icon icon={Download01Icon} className="size-4" />}
                          shortcut={shortcutText("Mod+E", platform)}
                        >
                          {exportLabel}
                        </Menu.ItemContent>
                      </Menu.Item>
                    ) : (
                      <Menu.Item disabled={copyDisabled} onClick={onCopy}>
                        <Menu.ItemContent
                          icon={<Icon icon={Copy01Icon} className="size-4" />}
                          shortcut={shortcutText("Mod+C", platform)}
                        >
                          {actions.copyLabel ?? "Copy"}
                        </Menu.ItemContent>
                      </Menu.Item>
                    )}
                    <Menu.Item onClick={onOpenFile}>
                      <Menu.ItemContent icon={<Icon icon={FolderOpenIcon} className="size-4" />}>
                        Open another file
                      </Menu.ItemContent>
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item onClick={onShowKeybinds} className="sm:hidden">
                      <Menu.ItemContent
                        icon={<Icon icon={KeyboardIcon} className="size-4" />}
                        shortcut={shortcutText("?", platform)}
                      >
                        Keyboard shortcuts
                      </Menu.ItemContent>
                    </Menu.Item>
                    <Menu.Item onClick={onToggleColorMode}>
                      <Menu.ItemContent icon={<Icon icon={themeGlyph} className="size-4" />}>
                        {themeLabel}
                      </Menu.ItemContent>
                    </Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                      render={<a href={REPO_URL} target="_blank" rel="noopener noreferrer" />}
                      onClick={() => onOpenGitHub?.()}
                    >
                      <Menu.ItemContent icon={<Icon icon={GithubIcon} className="size-4" />}>
                        GitHub
                      </Menu.ItemContent>
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </>
      ) : (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ExternalLink
            href={STATUS_URL}
            label="Status"
            icon={Activity01Icon}
            className={PHONE_TAP}
          />
          <ExternalLink
            href={REPO_URL}
            label="View on GitHub"
            icon={GithubIcon}
            className={PHONE_TAP}
            onOpen={onOpenGitHub}
          />
          <HintButton
            label="Keyboard shortcuts"
            icon={<Icon icon={KeyboardIcon} className="size-4" />}
            onClick={onShowKeybinds}
            combo="?"
            platform={platform}
          />
          <HintButton
            label={themeLabel}
            icon={<Icon icon={themeGlyph} className="size-4" />}
            onClick={onToggleColorMode}
            platform={platform}
            className={PHONE_TAP}
          />
        </div>
      )}
    </header>
  );
}

const SPLIT_RIGHT = "export-split-right h-8! w-7 px-0! max-sm:h-10! max-sm:w-9";

function SplitChevron({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <Menu.Trigger
      render={<Button variant="primary" disabled={disabled} className={SPLIT_RIGHT} />}
      aria-label={label}
    >
      <span className="flex size-full items-center justify-center">
        <Icon icon={ArrowDown01Icon} className="size-4" />
      </span>
    </Menu.Trigger>
  );
}

/**
 * The menu half of the split Export button: picks the format the main button exports, and
 * copies when the editor can (a video frame).
 */
function ExportFormatMenu({
  choice,
  disabled,
  copyLabel,
  copyDisabled,
  platform,
  onCopy,
}: {
  choice: ExportFormatChoice;
  disabled: boolean;
  copyLabel: string | null;
  copyDisabled: boolean;
  platform: Platform;
  onCopy: () => void;
}) {
  return (
    <Menu.Root>
      <SplitChevron label="Export format" disabled={disabled} />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="min-w-40!">
            <Menu.Group>
              <Menu.GroupLabel>Format</Menu.GroupLabel>
              <Menu.RadioGroup
                value={choice.selected}
                onValueChange={(id: unknown) => {
                  if (typeof id === "string") choice.onSelect(id);
                }}
              >
                {choice.options.map((option) => (
                  <Menu.RadioItem key={option.id} value={option.id} closeOnClick>
                    <Menu.ItemContent
                      icon={
                        <Menu.RadioItemIndicator keepMounted={false}>
                          <Icon icon={Tick02Icon} className="size-4" />
                        </Menu.RadioItemIndicator>
                      }
                    >
                      {option.label}
                    </Menu.ItemContent>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            {copyLabel === null ? null : (
              <>
                <Menu.Separator />
                <Menu.Item disabled={copyDisabled} onClick={onCopy}>
                  <Menu.ItemContent
                    icon={<Icon icon={Copy01Icon} className="size-4" />}
                    shortcut={shortcutText("Mod+C", platform)}
                  >
                    {copyLabel}
                  </Menu.ItemContent>
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * The menu half of a Copy main button: each item downloads right away in its format and makes
 * that format the one Mod+E exports.
 */
function DirectExportMenu({
  choice,
  disabled,
  exporting,
  platform,
  onExport,
}: {
  choice: ExportFormatChoice;
  disabled: boolean;
  exporting: boolean;
  platform: Platform;
  onExport: (format: string) => void;
}) {
  return (
    <Menu.Root>
      <SplitChevron label={exporting ? "Exporting" : "Export"} disabled={disabled} />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="min-w-44!">
            <Menu.Group>
              <Menu.GroupLabel>Export</Menu.GroupLabel>
              {choice.options.map((option) => (
                <Menu.Item
                  key={option.id}
                  onClick={() => {
                    choice.onSelect(option.id);
                    onExport(option.id);
                  }}
                >
                  <Menu.ItemContent
                    icon={<Icon icon={Download01Icon} className="size-4" />}
                    // Mod+E repeats the last format exported.
                    shortcut={
                      option.id === choice.selected ? shortcutText("Mod+E", platform) : undefined
                    }
                  >
                    Export {option.label}
                  </Menu.ItemContent>
                </Menu.Item>
              ))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
