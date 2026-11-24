/**
 * Puts an encoded frame on the clipboard and says how it went. Settles the way the shell's `copy`
 * contract asks: resolves once the clipboard took the PNG, rejects (after the error toast) when it
 * did not, so the shell counts only copies that landed.
 */
export function writeFrameToClipboard<Item>(args: {
  readonly png: Promise<Blob>;
  readonly clipboard: { write(items: Item[]): Promise<void> };
  readonly toItem: (png: Promise<Blob>) => Item;
  readonly onStatus: (message: string, tone: "success" | "error") => void;
}): Promise<void> {
  return args.clipboard.write([args.toItem(args.png)]).then(
    () => args.onStatus("Frame copied as PNG.", "success"),
    (cause: unknown) => {
      const reason =
        cause instanceof Error && cause.message !== "" ? cause.message : "clipboard denied";
      args.onStatus(`Couldn't copy the frame: ${reason}`, "error");
      throw cause;
    },
  );
}
