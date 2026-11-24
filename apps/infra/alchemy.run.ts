import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

/** Hostname the site is served from, derived from the public app URL (see `.env.schema`). */
const hostname = new URL(process.env["PUBLIC_APP_URL"] ?? "https://edit.here").hostname;

/**
 * edit.here is a fully client-side app: the Vite build in `apps/web/dist` is deployed as an
 * assets-only Cloudflare Worker (Alchemy's static-site resource, the successor to Pages).
 */
export default Alchemy.Stack(
  "edit-here",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.Website.StaticSite("Web", {
      cwd: "../web",
      command: "pnpm build",
      outdir: "dist",
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "single-page-application",
      },
      domain: hostname,
      dev: { command: "pnpm dev" },
    });
    return { url: site.url };
  }),
);
