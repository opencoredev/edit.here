import { AI_AGENT_USER_AGENT, trackAgents } from "@databuddy/sdk/agents";
import { next } from "@vercel/functions";

/**
 * Vercel Routing Middleware: counts reads by AI crawlers and agents (GPTBot, ClaudeBot, Claude
 * Code, llms.txt readers) in Databuddy's AI traffic, which the browser tracker cannot see because
 * these clients run no JavaScript. Every request passes through unchanged.
 *
 * The request is classified here and only fixed values reach the SDK: a fixed token for the
 * agent from KNOWN_AGENTS (such as "GPTBot"), never text from the request's own user agent, "text/markdown" or "text/html" for what it asked
 * for, the production host and a path from the fixed list below. No other header text, query,
 * referrer, cookie or IP address is passed on, and nothing is reported under Global Privacy
 * Control or Do Not Track. Clients that only look like agents by their Accept or Signature-Agent
 * headers are not reported.
 */
export const config = {
  matcher: ["/((?!assets/|fonts/|sw\\.js).*)"],
};

const PRODUCTION_HOST = "edit.here";

/**
 * The agents reported, each as a fixed user agent token Databuddy recognizes. The first pattern
 * that matches names the agent; anything else is not reported.
 */
const KNOWN_AGENTS: readonly (readonly [RegExp, string])[] = [
  [/claude-code\//i, "Claude-User (claude-code/"],
  [/\bClaudeBot\b|^claudebot$/i, "ClaudeBot"],
  [/\bClaude-SearchBot\b/i, "Claude-SearchBot"],
  [/\bClaude-User\b/i, "Claude-User"],
  [/\banthropic-ai\b/i, "anthropic-ai"],
  [/\bGPTBot\b/i, "GPTBot"],
  [/\bChatGPT-User\b/i, "ChatGPT-User"],
  [/\bOAI-SearchBot\b/i, "OAI-SearchBot"],
  [/\bPerplexityBot\b/i, "PerplexityBot/"],
  [/\bPerplexity-?User\b/i, "Perplexity-User"],
  [/\bGoogle-Agent\b/i, "Google-Agent"],
  [/\bGoogleOther\b/i, "GoogleOther"],
  [/\bGemini-Deep-Research\b/i, "Gemini-Deep-Research"],
  [/\bGoogle-Gemini-CLI\//i, "Google-Gemini-CLI/"],
  [/\bGitHubCopilot/i, "GitHubCopilot"],
  [/^Cursor\//i, "Cursor/1.0 ("],
  [/\bmeta-externalagent\b/i, "meta-externalagent/"],
  [/\bmeta-externalfetcher\b/i, "meta-externalfetcher/"],
  [/\bApplebot\b/i, "Applebot"],
  [/\bAmazonbot\b/i, "Amazonbot"],
  [/\bCCBot\b/i, "CCBot"],
  [/\bBytespider\b/i, "Bytespider"],
  [/\bDuckAssistBot\b/i, "DuckAssistBot"],
  [/\bMistralAI-User\b/i, "MistralAI-User"],
  [/\bgrok-agent\//i, "grok-agent/"],
  [/\bDeepSeekBot\b/i, "DeepSeekBot"],
  [/\bKimi-User\b/i, "Kimi-User/"],
];

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

/** Reports one isolate may send at once before it has to wait for the bucket to refill. */
export const REPORT_BURST = 60;
/** Reports added back to the bucket each second, up to REPORT_BURST. */
export const REPORT_REFILL_PER_SECOND = 1;

/**
 * A token bucket that caps how many reports one isolate sends, so a flood of requests claiming
 * to be agents cannot flood Databuddy. Returns whether a report may go out now; time comes from
 * `now` in milliseconds.
 */
export function createReportLimiter(
  burst: number,
  refillPerSecond: number,
  now: () => number,
): () => boolean {
  const capacity = burst * 1000;
  let milliTokens = capacity;
  let last = Math.floor(now());
  return () => {
    const current = Math.floor(now());
    if (current > last) {
      milliTokens = Math.min(capacity, milliTokens + (current - last) * refillPerSecond);
      last = current;
    }
    if (milliTokens < 1000) return false;
    milliTokens -= 1000;
    return true;
  };
}

const allowReport = createReportLimiter(REPORT_BURST, REPORT_REFILL_PER_SECOND, () => Date.now());

/** What the SDK gets for one request, built only from fixed values; null when nothing is reported. */
export function agentHit(request: Request): Parameters<typeof trackAgents>[0] | null {
  const url = new URL(request.url);
  if (url.hostname !== PRODUCTION_HOST) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") return null;
  const userAgent = request.headers.get("user-agent") ?? "";
  const agent = KNOWN_AGENTS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (agent === undefined || !AI_AGENT_USER_AGENT.test(agent)) return null;
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
    if (hit !== null && context?.waitUntil !== undefined && allowReport()) {
      context.waitUntil(trackAgents(hit, { websiteId }));
    }
  } catch {
    // Reporting never changes the response.
  }
  return next();
}
