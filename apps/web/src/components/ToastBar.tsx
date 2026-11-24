import type { ToastMessage } from "@edit-here/core";
import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { AnimatePresence, m, useReducedMotion } from "motion/react";

const TONE_ICON = {
  info: InformationCircleIcon,
  success: CheckmarkCircle02Icon,
  error: AlertCircleIcon,
} as const;
const TONE_CLASS = { info: "text-brand", success: "text-ok", error: "text-danger" } as const;

/**
 * Single-slot status toast, top center under the header and the editor's tool bar (the editor
 * publishes that height as `--editor-chrome-top`). On phones the tools sit at the bottom, so it
 * sits right under the header. The editor machine owns its lifetime and auto-dismiss.
 */
export function ToastBar({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: (id: number) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-[calc(52px+var(--editor-chrome-top,8px))] z-50 flex justify-center px-4 max-sm:top-14 max-sm:px-2.5"
    >
      <AnimatePresence initial={false}>
        {toast === null ? null : (
          <m.div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            initial={reduced === true ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced === true ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "top center" }}
            className="alloy-panel pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-3 py-2.5 pr-2 pl-3.5 text-sm text-ink shadow-lg"
          >
            {(() => {
              const glyph = TONE_ICON[toast.tone];
              return <Icon icon={glyph} className={`size-4 shrink-0 ${TONE_CLASS[toast.tone]}`} />;
            })()}
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-xs p-1 text-ink-muted hover:bg-n3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              aria-label="Dismiss"
            >
              <Icon icon={Cancel01Icon} className="size-3.5" />
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
