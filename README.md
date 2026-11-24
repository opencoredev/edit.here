# edit.here

Edit images and videos in your browser. Nothing is uploaded.

Use it at [edit.here](https://edit.here/).

<!-- Demo slot: add renders/demo.gif, then uncomment.
![edit.here demo](renders/demo.gif)
-->

## Features

- **Images** (PNG, JPG, WebP, GIF, AVIF, BMP): crop, rotate and flip, draw (pen, highlighter, arrows, boxes, text), redact with blackout, blur or pixelate, add more pictures to the canvas, and frame the result with padding, rounded corners, a shadow and a background. Export as PNG, JPEG or WebP, or copy to the clipboard.
- **Videos** (MP4, WebM, MOV, MKV, M4V): trim and split, delete segments, crop, rotate and flip, change speed and volume per clip, add fades in and out, and export.
- **Works offline**: after the first visit the whole app is cached, so it opens without a connection.
- **Picks up where you left off**: recent work is kept in your browser's IndexedDB.

## Keyboard shortcuts

Press `?` in the app for the full list. The common ones (`Mod` is Cmd on macOS, Ctrl elsewhere):

| Keys                    | Action                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `Mod+Z` / `Mod+Shift+Z` | Undo / redo                                                                        |
| `Mod+E`                 | Export                                                                             |
| `Mod+C`                 | Copy the result to the clipboard                                                   |
| `1`–`9`                 | Image tools: select, pen, highlighter, arrow, rectangle, text, redact, crop, frame |
| `Space`                 | Play or pause a video                                                              |
| `s` / `x`               | Split at the playhead / cut a segment                                              |
| `i` / `o`               | Set the in and out points                                                          |
| `j` `k` `l`             | Shuttle backward, pause, forward                                                   |

## Privacy

Files are opened, edited and exported on your device and never sent anywhere. There is no account. The production site counts anonymous page views and errors without cookies, never sends file names, file contents or anything you type, and skips analytics entirely when Global Privacy Control or Do Not Track is on. Self-hosted builds send nothing.

## Run it yourself

Requires Node 22 or newer and pnpm 10.

```sh
git clone https://github.com/opencoredev/edit.here.git
cd edit.here
pnpm install
pnpm dev      # dev server on http://localhost:5173
pnpm check    # typecheck and lint
pnpm test     # unit tests
pnpm build    # static site in apps/web/dist
```

The build is a static site: serve `apps/web/dist` from any static host. `vercel.json` holds the Vercel settings used for edit.here.

## License

MIT. See [LICENSE](LICENSE).
