import { describe, expect, it } from "vitest";
import { writeFrameToClipboard } from "../src/editors/video/copy-frame";
import { AppearanceLatch } from "../src/lib/star-prompt";
import { PendingOpens, readyOpen, resolveExportFormat, settleCopy } from "../src/lib/telemetry";

const noop = async () => ({ fileName: "photo-edited.png" });

describe("editor_opened (readyOpen + PendingOpens)", () => {
  it("counts an open once, when its editor has decoded the file", () => {
    const pending = new PendingOpens();
    pending.begin({ id: "a", source: "sample", openId: undefined });
    const session = { id: "a", kind: "image" } as const;
    // Detected, editor still decoding: it registers { busy: true }.
    expect(readyOpen({ session, registered: { sessionId: "a", actions: {} }, pending })).toBe(null);
    const ready = { sessionId: "a", actions: { exportFile: noop } };
    expect(readyOpen({ session, registered: ready, pending })).toEqual({
      kind: "image",
      source: "sample",
    });
    // Re-registering actions (every edit does) does not count again.
    expect(readyOpen({ session, registered: ready, pending })).toBe(null);
    expect(pending.size).toBe(0);
  });

  it("never counts a corrupt PNG that passes detection but fails to decode", () => {
    const pending = new PendingOpens();
    pending.begin({ id: "bad", source: "file", openId: undefined });
    const session = { id: "bad", kind: "image" } as const;
    // ImageEditor's error state registers { busy: false } and nothing else.
    const failed = { sessionId: "bad", actions: { busy: false } };
    expect(readyOpen({ session, registered: failed, pending })).toBe(null);
    // Then the visitor opens something else: the failed entry goes.
    pending.begin({ id: "next", source: "file", openId: undefined });
    pending.retain(["next", undefined]);
    expect(pending.size).toBe(1);
    expect(pending.ready("bad")).toBeUndefined();
  });

  it("ignores actions registered by a previous session", () => {
    const pending = new PendingOpens();
    pending.begin({ id: "b", source: "recent", openId: undefined });
    const stale = { sessionId: "a", actions: { exportFile: noop } };
    expect(readyOpen({ session: { id: "b", kind: "video" }, registered: stale, pending })).toBe(
      null,
    );
  });

  it("forgets an unsupported file once detection fails, keeping the open session", () => {
    const pending = new PendingOpens();
    pending.begin({ id: "open", source: "restore", openId: undefined });
    pending.begin({ id: "unsupported", source: "file", openId: undefined });
    // While detecting, the machine's pending id is "unsupported": keep it.
    pending.retain(["open", "unsupported"]);
    expect(pending.size).toBe(2);
    // Detection failed: pending is null again and the session is unchanged.
    pending.retain(["open", undefined]);
    expect(pending.size).toBe(1);
    expect(pending.ready("unsupported")).toBeUndefined();
    // Closing the file clears everything.
    pending.retain([undefined, undefined]);
    expect(pending.size).toBe(0);
  });
});

describe("PendingOpens: repeated opens", () => {
  it("does not count reopening the session already on screen (rage-clicking a recent project)", () => {
    const pending = new PendingOpens();
    const session = { id: "p", kind: "image" } as const;
    const ready = { sessionId: "p", actions: { exportFile: noop } };
    // Four clicks before the first load lands: one pending entry.
    for (let i = 0; i < 4; i += 1) pending.begin({ id: "p", source: "recent", openId: undefined });
    expect(readyOpen({ session, registered: ready, pending })).toEqual({
      kind: "image",
      source: "recent",
    });
    // Loads that land after the editor opened: "p" is on screen, so they are not new opens.
    for (let i = 0; i < 3; i += 1) pending.begin({ id: "p", source: "recent", openId: "p" });
    expect(readyOpen({ session, registered: ready, pending })).toBe(null);
    // Closing and opening it again is a new open.
    pending.begin({ id: "p", source: "recent", openId: undefined });
    expect(readyOpen({ session, registered: ready, pending })).toEqual({
      kind: "image",
      source: "recent",
    });
  });
});

describe("resolveExportFormat", () => {
  it("reports the format really used, normalized, never 'default' or an editor's MIME type", () => {
    // ImageEditor's ids are MIME types; VideoEditor's are short names.
    expect(resolveExportFormat(undefined, { selected: "image/png" })).toBe("png");
    expect(resolveExportFormat("image/jpeg", { selected: "image/png" })).toBe("jpeg");
    expect(resolveExportFormat("image/webp", { selected: "image/png" })).toBe("webp");
    expect(resolveExportFormat(undefined, { selected: "webm" })).toBe("webm");
    expect(resolveExportFormat("mp4", { selected: "webm" })).toBe("mp4");
  });

  it("gives undefined (no event) for anything outside the list", () => {
    expect(resolveExportFormat("privatepatient", { selected: "image/png" })).toBeUndefined();
    expect(resolveExportFormat(undefined, { selected: "image/gif" })).toBeUndefined();
    expect(resolveExportFormat(undefined, undefined)).toBeUndefined();
  });
});

describe("PendingOpens: decode failure", () => {
  it("drops a corrupt PNG's entry as soon as its editor reports the failure, while it stays open", () => {
    const pending = new PendingOpens();
    pending.begin({ id: "corrupt", source: "file", openId: undefined });
    const session = { id: "corrupt", kind: "image" } as const;
    // Detection passed, so it is the open session; retain() alone would keep it.
    pending.retain(["corrupt", undefined]);
    expect(pending.size).toBe(1);
    // ImageEditor enters its error state and calls onMediaError: the entry goes now.
    pending.fail("corrupt");
    expect(pending.size).toBe(0);
    // Even if the editor later registered actions, it never counts.
    const registered = { sessionId: "corrupt", actions: { exportFile: noop } };
    expect(readyOpen({ session, registered, pending })).toBe(null);
  });
});

describe("copy (settleCopy + video frame copy)", () => {
  it("calls onCopied only when the copy promise resolves", async () => {
    const events: string[] = [];
    const handlers = {
      onCopied: () => events.push("copied"),
      onFailed: () => events.push("failed"),
    };
    settleCopy(Promise.resolve(), handlers);
    settleCopy(Promise.reject(new Error("denied")), handlers);
    settleCopy(undefined, handlers);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.toSorted()).toEqual(["copied", "failed"]);
  });

  it("video frame copy resolves after the clipboard takes it, so the shell counts it", async () => {
    const statuses: string[] = [];
    const written: string[][] = [];
    const result = writeFrameToClipboard({
      png: Promise.resolve(new Blob(["png"])),
      clipboard: {
        write: async (items: string[]) => {
          written.push(items);
        },
      },
      toItem: () => "item",
      onStatus: (message, tone) => statuses.push(`${tone}:${message}`),
    });
    const events: string[] = [];
    settleCopy(result, {
      onCopied: () => events.push("image_copied"),
      onFailed: () => events.push("failed"),
    });
    await result;
    expect(written).toEqual([["item"]]);
    expect(statuses).toEqual(["success:Frame copied as PNG."]);
    expect(events).toEqual(["image_copied"]);
  });

  it("video frame copy rejects after its error toast when the clipboard refuses", async () => {
    const statuses: string[] = [];
    const result = writeFrameToClipboard({
      png: Promise.resolve(new Blob(["png"])),
      clipboard: { write: () => Promise.reject(new Error("Write permission denied.")) },
      toItem: () => "item",
      onStatus: (message, tone) => statuses.push(`${tone}:${message}`),
    });
    await expect(result).rejects.toThrow("Write permission denied.");
    expect(statuses).toEqual(["error:Couldn't copy the frame: Write permission denied."]);
  });
});

describe("AppearanceLatch (star_prompt_shown)", () => {
  it("fires once per appearance, never again while it stays visible", () => {
    const latch = new AppearanceLatch();
    expect(latch.update(false)).toBe(false);
    expect(latch.update(true)).toBe(true);
    // Re-render, StrictMode re-run, or Home -> video while showing.
    expect(latch.update(true)).toBe(false);
    expect(latch.update(true)).toBe(false);
    expect(latch.update(false)).toBe(false);
    expect(latch.update(true)).toBe(true);
  });
});
