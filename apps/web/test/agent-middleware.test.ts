import { afterEach, describe, expect, it, vi } from "vitest";
import middleware, { agentHit } from "../../../middleware";

const SECRET = "holiday-photo.png";

function request(path: string, headers: Record<string, string>, host = "edit.here"): Request {
  return new Request(`https://${host}${path}`, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("agent middleware", () => {
  it("passes only fixed values for a known agent", () => {
    const hit = agentHit(
      request(`/llms.txt?f=${SECRET}`, {
        "user-agent": `Mozilla/5.0 (compatible; GPTBot/1.2; ${SECRET})`,
        "signature-agent": SECRET,
        accept: `text/markdown, ${SECRET}`,
        referer: `https://x.test/?f=${SECRET}`,
        "x-forwarded-for": "1.2.3.4",
        cookie: SECRET,
      }),
    );
    expect(hit).toEqual({
      method: "GET",
      url: "/llms.txt",
      headers: { host: "edit.here", "user-agent": "GPTBot", accept: "text/markdown" },
    });
  });

  it("reports other paths as /other and ignores people, opt-outs and previews", () => {
    expect(agentHit(request(`/${SECRET}`, { "user-agent": "ClaudeBot/1.0" }))?.url).toBe("/other");
    expect(agentHit(request("/", { "user-agent": "Mozilla/5.0 Chrome/142" }))).toBeNull();
    expect(agentHit(request("/", { "user-agent": "text", accept: "text/markdown" }))).toBeNull();
    expect(agentHit(request("/", { "user-agent": "GPTBot/1.2", "sec-gpc": "1" }))).toBeNull();
    expect(agentHit(request("/", { "user-agent": "GPTBot/1.2", dnt: "1" }))).toBeNull();
    expect(agentHit(request("/", { "user-agent": "GPTBot/1.2" }, "edit-here.vercel.app"))).toBeNull();
  });

  it("always continues the request, and sends no raw header text to Databuddy", async () => {
    vi.stubEnv("VITE_DATABUDDY_CLIENT_ID", "site-1");
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bodies.push(init.body);
        return new Response("ok");
      }),
    );
    const waits: Promise<unknown>[] = [];
    const response = middleware(
      request(`/?q=${SECRET}`, {
        "user-agent": `Claude-User (claude-code/2.1.0; ${SECRET})`,
        referer: SECRET,
      }),
      { waitUntil: (promise) => waits.push(promise) },
    );
    await Promise.all(waits);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain(SECRET);
    expect(bodies[0]).not.toContain("1.2.3.4");
  });
});
