import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { send, waitFor as waitForEffect } from "@xstate/effect";
import { createActor, SimulatedClock, waitFor } from "xstate";
import {
  editorMachine,
  makeEditorActor,
  runDetectFileEffect,
  TOAST_DURATION_MS,
} from "../src/index";

const png = { name: "shot.png", type: "image/png", size: 1200 };
const mp4 = { name: "clip.mp4", type: "video/mp4", size: 4000 };
const pdf = { name: "doc.pdf", type: "application/pdf", size: 4000 };
const txt = { name: "notes.txt", type: "text/plain", size: 10 };

function start() {
  const clock = new SimulatedClock();
  const actor = createActor(editorMachine, { clock }).start();
  return { actor, clock };
}

describe("runDetectFileEffect", () => {
  it("folds Effect failures into a result value", async () => {
    await expect(runDetectFileEffect(png)).resolves.toEqual({
      kind: "supported",
      mediaKind: "image",
    });
    const result = await runDetectFileEffect(txt);
    expect(result.kind).toBe("unsupported");
  });
});

describe("editorMachine", () => {
  it("starts idle with a closed sheet and no toast", () => {
    const { actor } = start();
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.session).toBeNull();
    expect(snap.context.keybindsOpen).toBe(false);
    expect(snap.context.toast).toBeNull();
    actor.stop();
  });

  it("opens a supported file into an editing session", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    expect(actor.getSnapshot().value).toBe("detecting");
    const snap = await waitFor(actor, (s) => s.matches("editing"));
    expect(snap.context.session).toEqual({
      id: "a",
      name: "shot.png",
      mimeType: "image/png",
      size: 1200,
      kind: "image",
    });
    expect(snap.context.pending).toBeNull();
    actor.stop();
  });

  it("enters error for an unsupported first file and recovers", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: txt });
    const errored = await waitFor(actor, (s) => s.matches("error"));
    expect(errored.context.error).toContain("notes.txt");
    actor.send({ type: "error.dismiss" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.error).toBeNull();

    actor.send({ type: "file.open", id: "b", file: txt });
    await waitFor(actor, (s) => s.matches("error"));
    actor.send({ type: "file.open", id: "c", file: mp4 });
    const editing = await waitFor(actor, (s) => s.matches("editing"));
    expect(editing.context.session?.kind).toBe("video");
    expect(editing.context.error).toBeNull();
    actor.stop();
  });

  it("rejects a PDF as an unsupported file", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: pdf });
    const errored = await waitFor(actor, (s) => s.matches("error"));
    expect(errored.context.error).toContain("doc.pdf");
    expect(errored.context.session).toBeNull();
    actor.stop();
  });

  it("keeps the current session and shows an error toast for an unsupported replacement", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    await waitFor(actor, (s) => s.matches("editing"));
    actor.send({ type: "file.open", id: "b", file: txt });
    const snap = await waitFor(actor, (s) => s.matches("editing") && s.context.toast !== null);
    expect(snap.context.session?.id).toBe("a");
    expect(snap.context.toast?.tone).toBe("error");
    actor.stop();
  });

  it("replaces the session when a new supported file is dropped while editing", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    await waitFor(actor, (s) => s.matches("editing"));
    actor.send({ type: "file.open", id: "b", file: mp4 });
    const snap = await waitFor(actor, (s) => s.matches("editing") && s.context.session?.id === "b");
    expect(snap.context.session?.kind).toBe("video");
    actor.stop();
  });

  it("uses the latest file when several are opened during detection", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    actor.send({ type: "file.open", id: "b", file: mp4 });
    const snap = await waitFor(actor, (s) => s.matches("editing"));
    expect(snap.context.session?.id).toBe("b");
    actor.stop();
  });

  it("runs export through exporting and back with a toast", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    await waitFor(actor, (s) => s.matches("editing"));
    actor.send({ type: "export.start", label: "Encoding MP4" });
    expect(actor.getSnapshot().value).toBe("exporting");
    expect(actor.getSnapshot().context.exportLabel).toBe("Encoding MP4");
    actor.send({ type: "export.done", message: "Saved shot.png" });
    let snap = actor.getSnapshot();
    expect(snap.value).toBe("editing");
    expect(snap.context.exportLabel).toBeNull();
    expect(snap.context.toast).toMatchObject({ message: "Saved shot.png", tone: "success" });

    actor.send({ type: "export.start" });
    expect(actor.getSnapshot().context.exportLabel).toBe("Exporting…");
    actor.send({ type: "export.failed", message: "Encoder crashed" });
    snap = actor.getSnapshot();
    expect(snap.value).toBe("editing");
    expect(snap.context.toast).toMatchObject({ message: "Encoder crashed", tone: "error" });
    actor.stop();
  });

  it("ignores export events outside their states", () => {
    const { actor } = start();
    actor.send({ type: "export.start" });
    expect(actor.getSnapshot().value).toBe("idle");
    actor.send({ type: "export.done", message: "x" });
    expect(actor.getSnapshot().context.toast).toBeNull();
    actor.stop();
  });

  it("closes a session back to idle", async () => {
    const { actor } = start();
    actor.send({ type: "file.open", id: "a", file: png });
    await waitFor(actor, (s) => s.matches("editing"));
    actor.send({ type: "keybinds.open" });
    actor.send({ type: "session.close" });
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.session).toBeNull();
    expect(snap.context.keybindsOpen).toBe(false);
    actor.stop();
  });

  it("opens, toggles and closes the keybinds sheet in any state", () => {
    const { actor } = start();
    actor.send({ type: "keybinds.toggle" });
    expect(actor.getSnapshot().context.keybindsOpen).toBe(true);
    actor.send({ type: "keybinds.toggle" });
    expect(actor.getSnapshot().context.keybindsOpen).toBe(false);
    actor.send({ type: "keybinds.open" });
    actor.send({ type: "keybinds.close" });
    expect(actor.getSnapshot().context.keybindsOpen).toBe(false);
    actor.stop();
  });

  it("auto-dismisses toasts and keeps a newer toast alive", () => {
    const { actor, clock } = start();
    actor.send({ type: "toast.show", message: "one", tone: "info" });
    expect(actor.getSnapshot().context.toast?.message).toBe("one");
    clock.increment(TOAST_DURATION_MS - 100);
    actor.send({ type: "toast.show", message: "two", tone: "success" });
    clock.increment(200);
    expect(actor.getSnapshot().context.toast?.message).toBe("two");
    clock.increment(TOAST_DURATION_MS);
    expect(actor.getSnapshot().context.toast).toBeNull();
    actor.stop();
  });

  it("dismisses a toast only by its own id", () => {
    const { actor } = start();
    actor.send({ type: "toast.show", message: "one", tone: "info" });
    const id = actor.getSnapshot().context.toast?.id ?? -1;
    actor.send({ type: "toast.dismiss", id: id + 1 });
    expect(actor.getSnapshot().context.toast).not.toBeNull();
    actor.send({ type: "toast.dismiss", id });
    expect(actor.getSnapshot().context.toast).toBeNull();
    actor.stop();
  });

  it.effect("runs inside an Effect scope through @xstate/effect", () =>
    Effect.gen(function* () {
      const actor = yield* makeEditorActor;
      yield* send(actor, { type: "file.open", id: "fx", file: mp4 });
      const snap = yield* waitForEffect(actor, (s) => s.matches("editing"), {
        timeout: "2 seconds",
      });
      expect(snap.context.session?.kind).toBe("video");
    }),
  );
});
