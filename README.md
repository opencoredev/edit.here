# edit.here

An image and video editor that runs in your browser. Files are opened, edited and exported on your device and never uploaded. After the first visit it also works offline.

Use it at [edit.here](https://edit.here/). Source: [github.com/opencoredev/edit.here](https://github.com/opencoredev/edit.here).

## Features

- **Images** (PNG, JPG, WebP, GIF, AVIF, BMP): crop, rotate and flip, draw (pen, highlighter, arrows, boxes, text), redact with blackout, blur or pixelate, add more pictures to the canvas, and frame the result with padding, rounded corners, a shadow and a background. Export as PNG, JPEG or WebP, or copy to the clipboard.
- **Videos** (MP4, WebM, MOV, MKV, M4V): trim and split, delete segments, crop, rotate and flip, change speed and volume per clip, add fades in and out, and export.
- **Local projects**: recent work is kept in the browser's IndexedDB, so a reload picks up where you left off.
- **Keyboard first**: press `?` in the app for the full list of shortcuts.

## Development

Requires Node 22 or newer and pnpm 10.

```sh
git clone https://github.com/opencoredev/edit.here.git
cd edit.here
pnpm install
pnpm dev      # Vite dev server on http://localhost:5173
pnpm check    # typecheck and lint
pnpm test     # unit tests
pnpm build    # production build in apps/web/dist
```

## Layout

| Path            | What it holds                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/core` | Pure TypeScript domain code: file detection, document operations, layout math, keybinds, state machine. No DOM. |
| `apps/web`      | The Vite + React app. Each editor (`src/editors/image`, `src/editors/video`) is its own lazy-loaded chunk.      |
| `apps/infra`    | An optional Alchemy stack that serves `apps/web/dist` from a Cloudflare Worker.                                 |

## Deploying

The site is static. `vercel.json` at the repo root builds `@edit-here/web`, serves `apps/web/dist`, falls back to `index.html` for client routes, caches hashed assets and fonts for a year, and keeps `sw.js` uncached so new deploys reach returning visitors.

Any other static host works too: build with `pnpm build` and serve `apps/web/dist`.

## License

MIT. See [LICENSE](LICENSE).
