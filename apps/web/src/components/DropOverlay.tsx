import { Exchange01Icon, FileAddIcon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Icon, type IconSvgElement } from "./Icon";
import { useState, type DragEvent } from "react";

export type DropIntent = "open" | "append";

type DropOverlayProps = {
  visible: boolean;
  hasSession: boolean;
  /** Show the add target (the open editor accepts extra files). */
  canAppend: boolean;
  /** The add target's title and detail, e.g. "Add to canvas" or "Add pages". */
  appendLabel: string;
  appendDetail: string;
  onDropFiles: (files: readonly File[], intent: DropIntent) => void;
};

function filesFrom(event: DragEvent): readonly File[] {
  return Array.from(event.dataTransfer.files);
}

/** Full-window drop surface shown while files are dragged over the page. */
export function DropOverlay({
  visible,
  hasSession,
  canAppend,
  appendLabel,
  appendDetail,
  onDropFiles,
}: DropOverlayProps) {
  const [hovered, setHovered] = useState<DropIntent | null>(null);
  if (!visible) return null;

  const targets: ReadonlyArray<{
    intent: DropIntent;
    title: string;
    detail: string;
    glyph: IconSvgElement;
  }> = canAppend
    ? [
        // Adding comes first: it keeps the work on screen, so it is the safe target.
        {
          intent: "append",
          title: appendLabel,
          detail: appendDetail,
          glyph: FileAddIcon,
        },
        {
          intent: "open",
          title: "Open as new file",
          detail: "Replaces the current file",
          glyph: Exchange01Icon,
        },
      ]
    : [
        {
          intent: "open",
          title: hasSession ? "Open file" : "Drop to open",
          detail: hasSession ? "Replaces the current file" : "Image or video",
          glyph: Upload01Icon,
        },
      ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-canvas/70 p-6 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col gap-4 sm:flex-row">
        {targets.map(({ intent, title, detail, glyph }) => (
          <div
            key={intent}
            data-active={hovered === intent ? "" : undefined}
            className="alloy-panel drop-target flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center transition-colors"
            onDragEnter={() => setHovered(intent)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setHovered(intent);
            }}
            onDragLeave={() => setHovered((current) => (current === intent ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setHovered(null);
              onDropFiles(filesFrom(event), intent);
            }}
          >
            <Icon icon={glyph} className="size-7 text-brand" />
            <p className="text-base font-medium text-ink">{title}</p>
            <p className="text-sm text-ink-muted">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
