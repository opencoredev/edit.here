import { Alert02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { Component, type ReactNode } from "react";
import { reportError } from "../lib/analytics";
import { Button } from "./graphical/index";

type Props = {
  children: ReactNode;
  onClose: () => void;
};

type State = { failed: boolean };

/**
 * Catches an editor chunk that fails to download (offline before the app was cached) or an
 * editor that throws while rendering, so the shell stays usable instead of going blank.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    reportError(error, { source: "editor" });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
        role="alert"
      >
        <Icon icon={Alert02Icon} className="size-6 text-ink-muted" />
        <p className="text-base font-medium text-ink">This editor couldn't load</p>
        <p className="max-w-sm text-sm text-ink-muted">
          If you're offline, reconnect once so edit.here can save itself for offline use, then try
          again.
        </p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button onClick={this.props.onClose}>Close file</Button>
        </div>
      </div>
    );
  }
}
