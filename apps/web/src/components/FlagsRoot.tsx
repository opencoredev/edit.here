import { FlagsProvider } from "@databuddy/sdk/react";
import type { ReactNode } from "react";
import { analyticsEnabled, DATABUDDY_CLIENT_ID } from "../lib/analytics";

/**
 * Databuddy feature flags, mounted only where analytics runs. Anywhere else the SDK never loads,
 * so it makes no requests and touches no storage, and every flag shows its default.
 */
export function FlagsRoot({ children }: { readonly children: ReactNode }) {
  if (!analyticsEnabled()) return children;
  return <FlagsProvider clientId={DATABUDDY_CLIENT_ID}>{children}</FlagsProvider>;
}
