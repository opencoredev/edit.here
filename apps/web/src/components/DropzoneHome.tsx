/*
 * Direction
 * Reference: a drafting mat under a precision tool (Figma's dotted canvas): the page is the
 *   work surface, not a marketing page.
 * Palette: Alloy neutrals for the mat and surfaces; color-1 only where something is live (the
 *   drop plate on hover or drag, a sample's icon on hover).
 * Type: Inter for the one headline; JetBrains Mono for specs and formats, like a spec sheet.
 * Layout: one centered column: headline, a machined drop plate, the projects saved on this
 *   device (when there are any), then one quiet row of samples.
 * Avoiding: icon-row hero, feature grids, pill badges, testimonials, filler copy.
 */
import type { MediaKind } from "@edit-here/core";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  Image01Icon,
  Upload01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { Icon, type IconSvgElement } from "./Icon";
import type { MouseEvent } from "react";
import { Button, ButtonContent } from "./graphical/index";
import type { Platform } from "../lib/platform";
import { Keys } from "./Keys";
import type { RecentWorkspace } from "../lib/workspace-store";
import { RecentProjects } from "./RecentProjects";

type DropzoneHomeProps = {
  platform: Platform;
  opening: boolean;
  /** A file is being dragged over the window. */
  dragging: boolean;
  loadingSample: MediaKind | null;
  error: string | null;
  /** Projects saved on this device, newest first. */
  recents: readonly RecentWorkspace[];
  onChooseFile: () => void;
  onSample: (kind: MediaKind) => void;
  onOpenRecent: (id: string) => void;
  onDeleteRecent: (id: string) => void;
  onClearRecents: () => void;
  onDismissError: () => void;
};

const FORMATS = ["PNG", "JPG", "WebP", "MP4", "WebM"] as const;

type Sample = {
  readonly kind: MediaKind;
  readonly title: string;
  /** What the editor does, in two or three words joined by middle dots. */
  readonly actions: string;
  readonly glyph: IconSvgElement;
};

const SAMPLES: readonly Sample[] = [
  { kind: "image", title: "Image", actions: "Crop · Draw · Frame", glyph: Image01Icon },
  { kind: "video", title: "Video", actions: "Trim · Speed · Audio", glyph: Video01Icon },
];

/** Home: the whole window is the drop target; the page offers the picker and two samples. */
export function DropzoneHome({
  platform,
  opening,
  dragging,
  loadingSample,
  error,
  recents,
  onChooseFile,
  onSample,
  onOpenRecent,
  onDeleteRecent,
  onClearRecents,
  onDismissError,
}: DropzoneHomeProps) {
  // The whole plate opens the picker; the button inside stays the keyboard path.
  const onPlateClick = (event: MouseEvent<HTMLDivElement>) => {
    if (opening) return;
    if (event.target instanceof Element && event.target.closest("button") !== null) return;
    onChooseFile();
  };

  return (
    <div className="home-mat relative flex flex-1 flex-col items-center px-4 pt-6 pb-8 sm:pt-6 sm:pb-12">
      {/* Auto margins center the column but give way to scrolling once it outgrows the window. */}
      <section
        aria-label="Open a file"
        className="relative flex w-full max-w-[880px] flex-col items-center gap-6 sm:my-auto sm:gap-8"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[32px] leading-[1.08] font-semibold tracking-[-0.03em] text-balance text-ink sm:text-[42px] sm:leading-[1.08]">
            Drop anything. Edit here.
          </h1>
          <p className="font-mono text-xs tracking-normal text-ink-muted">
            100% local · Zero uploads · Works offline
          </p>
        </div>

        <div
          data-active={dragging ? "" : undefined}
          onClick={onPlateClick}
          className="drop-plate group alloy-panel relative flex w-full max-w-[640px] cursor-pointer flex-col items-center gap-4 rounded-lg px-5 py-7 text-center sm:py-9"
        >
          <span
            aria-hidden="true"
            className="alloy-well flex size-10 items-center justify-center rounded-md! text-ink-muted transition-colors duration-150 group-hover:text-brand group-data-active:text-brand"
          >
            <Icon icon={Upload01Icon} className="size-[18px]" />
          </span>
          <Button
            variant="primary"
            onClick={onChooseFile}
            aria-label="Choose file"
            disabled={opening}
          >
            <ButtonContent loading={opening} contentKey="choose">
              <span>Choose file</span>
            </ButtonContent>
          </Button>
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-ink-muted">
            <span>or drop anywhere</span>
            <span className="contents max-sm:hidden">
              <span aria-hidden="true">·</span>
              <Keys combo="Mod+V" platform={platform} />
              <span>to paste</span>
            </span>
          </p>
          <p
            className="font-mono text-[11px] tracking-normal text-ink-muted"
            aria-label={`Supported: ${FORMATS.join(", ")}`}
          >
            {FORMATS.join(" · ")}
          </p>
        </div>

        {error === null ? null : (
          <div
            role="alert"
            className="flex w-full max-w-[640px] items-start gap-3 rounded-md bg-danger/10 px-4 py-3 text-start text-sm text-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--cte-danger)_35%,transparent)]"
          >
            <Icon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0 text-danger" />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={onDismissError}
              className="rounded-xs p-0.5 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              aria-label="Dismiss error"
            >
              <Icon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
        )}

        <RecentProjects
          recents={recents}
          disabled={opening}
          onOpen={onOpenRecent}
          onDelete={onDeleteRecent}
          onClearAll={onClearRecents}
        />

        <div className="flex w-full max-w-[640px] flex-col gap-2.5">
          <h2 className="text-center text-xs text-ink-muted">Or try a sample</h2>
          <ul className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {SAMPLES.map((sample) => (
              <li key={sample.kind} className="flex">
                <SampleCard
                  sample={sample}
                  loading={loadingSample === sample.kind}
                  disabled={loadingSample !== null}
                  onOpen={() => onSample(sample.kind)}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function SampleCard({
  sample,
  loading,
  disabled,
  onOpen,
}: {
  sample: Sample;
  loading: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-busy={loading || undefined}
      className="sample-pill group flex w-full items-center gap-2.5 rounded-md py-2 pr-2.5 pl-2 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default"
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-n3 text-ink-muted transition-colors duration-150 group-[:not(:disabled)]:group-hover:text-brand"
      >
        <Icon icon={sample.glyph} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">Open sample </span>
        <span className="text-sm leading-5 font-medium text-ink">{sample.title}</span>
        <span className="truncate text-xs leading-4 text-ink-muted">{sample.actions}</span>
      </span>
      <span
        aria-hidden="true"
        className={[
          "flex size-3.5 shrink-0 items-center justify-center text-ink-muted transition-[opacity,translate] duration-150 ease-alloy [&_.themed-button-content]:inline-flex",
          loading
            ? "opacity-100"
            : "opacity-0 -translate-x-1 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-[:not(:disabled)]:group-hover:translate-x-0 group-[:not(:disabled)]:group-hover:opacity-100 max-sm:translate-x-0 max-sm:opacity-60",
        ].join(" ")}
      >
        <ButtonContent loading={loading} contentKey={sample.kind}>
          <Icon icon={ArrowRight01Icon} className="size-3.5" />
        </ButtonContent>
      </span>
    </button>
  );
}
