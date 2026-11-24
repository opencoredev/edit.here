import { keybindsForScope, type KeybindScope, type MediaKind } from "@edit-here/core";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { Dialog } from "./graphical/index";
import type { Platform } from "../lib/platform";
import { Keys } from "./Keys";

const SCOPE_TITLES: Record<KeybindScope, string> = {
  global: "Everywhere",
  image: "Image editor",
  video: "Video editor",
};

type KeybindsDialogProps = {
  open: boolean;
  activeKind: MediaKind | null;
  platform: Platform;
  onOpenChange: (open: boolean) => void;
};

export function KeybindsDialog({ open, activeKind, platform, onOpenChange }: KeybindsDialogProps) {
  const media: readonly MediaKind[] = ["image", "video"];
  // The open editor's shortcuts come first, then the rest for reference.
  const scopes: readonly KeybindScope[] = [
    "global",
    ...(activeKind === null ? media : [activeKind, ...media.filter((k) => k !== activeKind)]),
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup
          className="flex flex-col gap-4 overflow-hidden"
          // Wider than the theme's default 400px modal: two columns of label + keycaps.
          style={{
            width: "min(760px, calc(100vw - 32px))",
            maxWidth: "none",
            maxHeight: "min(720px, calc(100dvh - 48px))",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
            <Dialog.Close aria-label="Close">
              <Icon icon={Cancel01Icon} className="size-4" />
            </Dialog.Close>
          </div>
          <div className="-mx-1 grid min-h-0 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto px-1 pb-1 sm:grid-cols-2">
            {scopes.map((scope) => (
              <section
                key={scope}
                aria-labelledby={`keys-${scope}`}
                className="flex flex-col gap-1"
              >
                <h3
                  id={`keys-${scope}`}
                  className="mb-1 flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
                >
                  {SCOPE_TITLES[scope]}
                  {scope === activeKind ? (
                    <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] text-brand normal-case">
                      open
                    </span>
                  ) : null}
                </h3>
                <dl className="flex flex-col">
                  {keybindsForScope(scope).map((entry) => (
                    <div
                      key={entry.action}
                      className="flex items-center justify-between gap-4 border-b border-line/40 py-1.5 last:border-b-0"
                    >
                      <dt className="text-sm text-ink">{entry.label}</dt>
                      <dd className="flex shrink-0 items-center gap-1.5">
                        {entry.keys.map((combo, index) => (
                          <span key={combo} className="flex items-center gap-1.5">
                            {index > 0 ? <span className="text-xs text-ink-muted">or</span> : null}
                            <Keys combo={combo} platform={platform} />
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
