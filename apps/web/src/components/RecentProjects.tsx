/*
 * Recent on this device: projects saved in this browser, newest first, as small cards on the
 * home mat. Same machined surfaces as the sample pills; the thumbnail sits in a recessed well
 * like the editor stage, so a card reads as "this file, as you left it".
 */
import { formatRelativeTime, type MediaKind } from "@edit-here/core";
import { Cancel01Icon, Image01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import type { RecentWorkspace } from "../lib/workspace-store";
import { Icon, type IconSvgElement } from "./Icon";

const KIND_LABELS: Record<MediaKind, string> = { image: "Image", video: "Video" };
const KIND_ICONS: Record<MediaKind, IconSvgElement> = {
  image: Image01Icon,
  video: Video01Icon,
};

/** How long "Clear all" waits for its confirming second click. */
const CONFIRM_MS = 3000;

/** The current time, refreshed every half minute so "2m ago" keeps up. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function RecentProjects({
  recents,
  disabled,
  onOpen,
  onDelete,
  onClearAll,
}: {
  recents: readonly RecentWorkspace[];
  /** A file is opening; cards wait. */
  disabled: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (recents.length === 0) return null;
  return (
    <section
      aria-labelledby="recent-heading"
      className="flex w-full max-w-[640px] flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-heading" className="text-xs text-ink-muted">
          Recent on this device
        </h2>
        <button
          type="button"
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            setConfirming(false);
            onClearAll();
          }}
          aria-live="polite"
          className={[
            "-my-1 rounded-xs px-1.5 py-1 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-brand",
            confirming ? "text-danger" : "text-ink-muted hover:text-ink",
          ].join(" ")}
        >
          {confirming ? "Click again to clear" : "Clear all"}
        </button>
      </div>
      <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        {recents.map((recent) => (
          <RecentCard
            key={recent.id}
            recent={recent}
            now={now}
            disabled={disabled}
            onOpen={() => onOpen(recent.id)}
            onDelete={() => onDelete(recent.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function RecentCard({
  recent,
  now,
  disabled,
  onOpen,
  onDelete,
}: {
  recent: RecentWorkspace;
  now: number;
  disabled: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const kind = recent.meta.kind;
  const when = formatRelativeTime({ time: recent.updatedAt, now });
  return (
    <li className="group/card relative flex min-w-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={`Open ${recent.fileName}, ${KIND_LABELS[kind]}, edited ${when.toLowerCase()}`}
        className="sample-pill flex w-full min-w-0 flex-col gap-1.5 rounded-md p-1.5 text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default"
      >
        <span className="recent-thumb flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-sm">
          {recent.thumbnail === null ? (
            <Icon icon={KIND_ICONS[kind]} className="size-5 text-ink-muted" />
          ) : (
            <img
              src={recent.thumbnail}
              alt=""
              draggable={false}
              className="size-full object-contain"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-0.5 pb-0.5">
          <span className="truncate text-xs leading-4 font-medium text-ink" title={recent.fileName}>
            {recent.fileName}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-ink-muted">
            <span className="shrink-0 rounded-xs bg-n3 px-1 font-mono text-[10px] leading-4 tracking-normal">
              {KIND_LABELS[kind]}
            </span>
            <span className="truncate">{when}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remove ${recent.fileName} from this device`}
        title="Remove"
        className="recent-remove absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-sm text-ink opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand motion-reduce:transition-none [@media(hover:none)]:opacity-100"
      >
        <Icon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </li>
  );
}
