import { defineFlag } from "@databuddy/sdk";

/**
 * Databuddy feature flags. Flags are evaluated only where analytics runs (the production build at
 * https://edit.here, with no opt-out; see FlagsRoot); everywhere else each flag shows its default.
 */

/** The Home headline A/B test. "control" is the shipped headline. */
export const HOME_HEADLINES = {
  control: "Drop anything. Edit here.",
  local: "Edit images and videos without uploading them.",
} as const;

export type HomeHeadlineVariant = keyof typeof HOME_HEADLINES;

export const homeHeadlineFlag = defineFlag<string>("home-headline", { default: "control" });

/** The headline for an assigned variant key; anything unknown, or none, shows the control. */
export function homeHeadline(variant: unknown): string {
  return variant === "local" ? HOME_HEADLINES.local : HOME_HEADLINES.control;
}
