import { AI_AGENT_USER_AGENT, trackAgents } from "@databuddy/sdk/agents";
import { next } from "@vercel/functions";

/**
 * Vercel Routing Middleware: counts reads by AI crawlers and agents (GPTBot, ClaudeBot, Claude
 * Code, llms.txt readers) in Databuddy's AI traffic, which the browser tracker cannot see because
 * these clients run no JavaScript. Every request passes through unchanged.
 *
 * The request is classified here and only fixed values reach the SDK: the known agent token
 * matched in the user agent (such as "GPTBot"), "text/markdown" or "text/html" for what it asked
 * for, the production host and a path from the fixed list below. No other header text, query,
 * referrer, cookie or IP address is passed on, and nothing is reported under Global Privacy
 * Control or Do Not Track. Clients that only look like agents by their Accept or Signature-Agent
 * headers are not reported.
 */
export const config = {
  matcher: ["/((?!assets/|fonts/|sw\\.js).*)"],
};

const PRODUCTION_HOST = "edit.here";

/** Public paths reported as they are; any other path is reported as "/other". */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(["/", "/llms.txt", "/robots.txt", "/sitemap.xml"]);

/** The runtime's environment variables (Vercel sets the production client id there). */
function runtimeEnv(): Readonly<Record<string, string | undefined>> {
  const proc: unknown = Reflect.get(globalThis, "process");
  if (typeof proc !== "object" || proc === null) return {};
  const env: unknown = Reflect.get(proc, "env");
  return typeof env === "object" && env !== null ? (env as Record<string, string | undefined>) : {};
}

type WaitUntil = { waitUntil?: (promise: Promise<unknown>) => void };

/** What the SDK gets for one request, built only from fixed values; null when nothing is reported. */
export function agentHit(request: Request): Parameters<typeof trackAgents>[0] | null {
  const url = new URL(request.url);
  if (url.hostname !== PRODUCTION_HOST) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return null;
  const agent = AI_AGENT_USER_AGENT.exec(request.headers.get("user-agent") ?? "")?.[0];
  if (agent === undefined || agent === "") return null;
  const markdown = /text\/(?:x-)?markdown/i.test(request.headers.get("accept") ?? "");
  return {
    method: request.method,
    url: PUBLIC_PATHS.has(url.pathname) ? url.pathname : "/other",
    headers: {
      host: PRODUCTION_HOST,
      "user-agent": agent,
      accept: markdown ? "text/markdown" : "text/html",
    },
  };
}

export default function middleware(request: Request, context?: WaitUntil): Response {
  try {
    const websiteId = runtimeEnv().VITE_DATABUDDY_CLIENT_ID?.trim() ?? "";
    const hit = websiteId === "" ? null : agentHit(request);
    if (hit !== null) context?.waitUntil?.(trackAgents(hit, { websiteId }));
  } catch {
    // Reporting never changes the response.
  }
  return next();
}
