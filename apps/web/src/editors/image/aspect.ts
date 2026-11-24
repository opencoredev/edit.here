export const ASPECT_PRESETS = ["free", "1:1", "4:3", "16:9", "9:16"] as const;

export type AspectPreset = (typeof ASPECT_PRESETS)[number];

export function isAspectPreset(value: unknown): value is AspectPreset {
  return ASPECT_PRESETS.some((preset) => preset === value);
}

export function aspectRatioOf(preset: AspectPreset): "free" | number {
  switch (preset) {
    case "free":
      return "free";
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** The preset after a quarter turn: 16:9 becomes 9:16; 4:3 has no portrait twin, so it frees. */
export function turnAspect(preset: AspectPreset): AspectPreset {
  switch (preset) {
    case "16:9":
      return "9:16";
    case "9:16":
      return "16:9";
    case "4:3":
      return "free";
    case "free":
    case "1:1":
      return preset;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** True when `size` has the preset's ratio, within a pixel of rounding. */
export function aspectFits(
  preset: AspectPreset,
  size: { readonly width: number; readonly height: number },
): boolean {
  const ratio = aspectRatioOf(preset);
  if (ratio === "free") return true;
  return Math.abs(size.width / size.height - ratio) <= 2 / Math.min(size.width, size.height);
}
