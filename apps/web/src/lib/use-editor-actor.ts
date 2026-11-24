import { editorMachine } from "@edit-here/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createActor } from "xstate";

const createEditorActor = () => createActor(editorMachine);
type EditorActor = ReturnType<typeof createEditorActor>;

/**
 * Runs the workspace machine for the component's lifetime and subscribes to its snapshot.
 * A stopped actor can't restart, so a remount (React StrictMode runs effects twice in
 * development) swaps in a fresh one.
 */
export function useEditorActor() {
  const [actor, setActor] = useState<EditorActor>(createEditorActor);

  useEffect(() => {
    if (actor.getSnapshot().status === "stopped") {
      // oxlint-disable-next-line react/set-state-in-effect -- replaces an actor stopped by a StrictMode remount
      setActor(createEditorActor());
      return;
    }
    actor.start();
    return () => {
      actor.stop();
    };
  }, [actor]);

  const snapshot = useSyncExternalStore(
    (onChange) => {
      const subscription = actor.subscribe(onChange);
      return () => subscription.unsubscribe();
    },
    () => actor.getSnapshot(),
  );

  return { actor, snapshot, send: actor.send } as const;
}
