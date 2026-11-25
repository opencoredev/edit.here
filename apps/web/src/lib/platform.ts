export type Platform = "mac" | "other";

export function detectPlatform(): Platform {
  // `userAgentData` is not in every browser or in lib.dom yet, so read it defensively.
  const uaData: unknown = Reflect.get(navigator, "userAgentData");
  const hinted =
    typeof uaData === "object" &&
    uaData !== null &&
    "platform" in uaData &&
    typeof uaData.platform === "string"
      ? uaData.platform
      : "";
  const name = hinted === "" ? navigator.platform : hinted;
  return /mac|iphone|ipad|ipod/i.test(name) ? "mac" : "other";
}

/** True when the primary pointer is a finger, so instructions say "Tap" rather than "Click". */
export function isTouchPrimary(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/** True when keyboard events should go to a text field instead of shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const nonText = ["button", "checkbox", "radio", "range", "color", "file", "submit", "reset"];
    return !nonText.includes(target.type);
  }
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit] ?? "GB"}`;
}
