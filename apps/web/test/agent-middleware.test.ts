import { afterEach, describe, expect, it, vi } from "vitest";
import middleware, { REPORT_BURST, agentHit, createReportLimiter } from "../../../middleware";

const SECRET = "holiday-photo.png";

function request(path: string, headers: Record<string, string>, host = "edit.here"): Request {
  return new Request(`https://${host}${path}`, { headers });
}

const agentOf = (userAgent: string) =>
  Reflect.get(agentHit(request("/", { "user-agent": userAgent }))?.headers ?? {}, "user-agent");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("report limiter", () => {
  it("allows the burst, drops reports once empty and refills over time", () => {
    let time = 1_000;
    const allow = createReportLimiter(3, 1, () => time);
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
    time += 500;
    expect(allow()).toBe(false);
    time += 500;
    expect([allow(), allow()]).toEqual([true, false]);
    time += 60_000;
    expect([allow(), allow(), allow(), allow()]).toEqual([true, true, true, false]);
  });

  it("does not gain tokens when the clock goes backwards", () => {
    let time = 10_000;
    const allow = createReportLimiter(1, 1, () => time);
    expect(allow()).toBe(true);
    time = 0;
    expect(allow()).toBe(false);
    time = 999;
    expect(allow()).toBe(false);
  });
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

  it("names agents with fixed tokens, never the request's own suffixes or versions", () => {
    expect(agentOf(`GitHubCopilotChat-${SECRET}/1.0`)).toBe("GitHubCopilot");
    expect(agentOf("Claude-User (claude-code/9.9.9; acme-corp)")).toBe("Claude-User (claude-code/");
    expect(agentOf(`amazon-Quick-on-behalf-of-${SECRET}`)).toBeUndefined();
    expect(agentOf("Cursor/3.1.4 (acme)")).toBe("Cursor/1.0 (");
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

  it("stops reporting a flood once the bucket is empty but still passes every request", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.stubEnv("VITE_DATABUDDY_CLIENT_ID", "site-1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok")),
    );
    let reports = 0;
    const context = { waitUntil: () => void reports++ };
    for (let i = 0; i < REPORT_BURST * 3; i++) {
      const response = middleware(request("/", { "user-agent": "GPTBot/1.2" }), context);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(reports).toBeGreaterThan(0);
    expect(reports).toBeLessThanOrEqual(REPORT_BURST);
    const drained = reports;
    expect(
      middleware(request("/", { "user-agent": "GPTBot/1.2" }), context).headers.get(
        "x-middleware-next",
      ),
    ).toBe("1");
    expect(reports).toBe(drained);
    vi.advanceTimersByTime(1_000);
    middleware(request("/", { "user-agent": "GPTBot/1.2" }), context);
    expect(reports).toBe(drained + 1);
  });
});
