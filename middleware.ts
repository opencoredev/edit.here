import { trackAgents } from "@databuddy/sdk/agents";

/**
 * Vercel Routing Middleware: reports requests from AI crawlers and agents (GPTBot, ClaudeBot,
 * Claude Code, llms.txt readers) to Databuddy's AI traffic, which the browser tracker cannot see
 * because these clients run no JavaScript. It never changes or delays the response, and only the
 * production host reports. Static assets and fonts never reach it.
 */
export const config = {
  matcher: ["/((?!assets/|fonts/|sw\\.js).*)"],
};

const PRODUCTION_HOST = "edit.here";

type WaitUntil = { waitUntil?: (promise: Promise<unknown>) => void };

export default function middleware(request: Request, context?: WaitUntil): undefined {
  if (new URL(request.url).hostname !== PRODUCTION_HOST) return undefined;
  const websiteId = process.env.VITE_DATABUDDY_CLIENT_ID?.trim();
  if (websiteId === undefined || websiteId === "") return undefined;
  context?.waitUntil?.(trackAgents(request, { websiteId }));
  return undefined;
}
