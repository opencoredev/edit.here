import { trackAgents } from "@databuddy/sdk/agents";
import { next } from "@vercel/functions";

/**
 * Vercel Routing Middleware: counts reads by AI crawlers and agents (GPTBot, ClaudeBot, Claude
 * Code, llms.txt readers) in Databuddy's AI traffic, which the browser tracker cannot see because
 * these clients run no JavaScript. Every request passes through unchanged.
 *
 * Only a rebuilt request reaches the SDK: the method, the agent's user agent, Signature-Agent,
 * Accept and Sec-Fetch-Mode headers (what it uses to recognize an agent), the production host
 * and a path from the fixed list below. No query, referrer, cookie or IP address is passed on,
 * and nothing is reported under Global Privacy Control or Do Not Track.
 */
export const config = {
  matcher: ["/((?!assets/|fonts/|sw\\.js).*)"],
};

const PRODUCTION_HOST = "edit.here";

/** Public paths reported as they are; any other path is reported as "/other". */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
]);

const FORWARDED_HEADERS = ["user-agent", "signature-agent", "accept", "sec-fetch-mode"] as const;

type WaitUntil = { waitUntil?: (promise: Promise<unknown>) => void };

function agentHit(request: Request): Parameters<typeof trackAgents>[0] | null {
  const url = new URL(request.url);
  if (url.hostname !== PRODUCTION_HOST) return null;
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return null;
  const headers: Record<string, string> = { host: PRODUCTION_HOST };
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  const path = PUBLIC_PATHS.has(url.pathname) ? url.pathname : "/other";
  return { method: request.method, url: path, headers };
}

export default function middleware(request: Request, context?: WaitUntil): Response {
  try {
    const websiteId = process.env.VITE_DATABUDDY_CLIENT_ID?.trim();
    const hit = websiteId ? agentHit(request) : null;
    if (hit !== null) context?.waitUntil?.(trackAgents(hit, { websiteId }));
  } catch {
    // Reporting never changes the response.
  }
  return next();
}
