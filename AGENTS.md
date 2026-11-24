# edit.here

Browser-only editor for images (crop, redact, frame) and videos (trim, crop). Files never leave the device.

For UI work, follow GUI.md and use the current theme with graphical-ui. Follow the workflow guidance in GUI.md for imports, editor changes, conversion, or audits.

## Architecture (Rat Stack)

pnpm workspace + Turborepo, strict TypeScript everywhere (`tsconfig.base.json`).

| Path            | Package            | Role                                                                                                                                                    |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | `@edit-here/core`  | Pure domain: types, Effect tagged errors, file detection (Effect), immutable document operations, keybind catalog, XState v6 workspace machine. No DOM. |
| `apps/web`      | `@edit-here/web`   | Vite + React 19 + Tailwind v4 shell on the Graphical UI Alloy theme. Editors live in `src/editors/{image,video}`.                                       |
| `apps/infra`    | `@edit-here/infra` | Alchemy v2 stack: `apps/web/dist` as an assets-only Cloudflare Worker on the `PUBLIC_APP_URL` host.                                                     |

Commands from the root: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format`, `pnpm check`, `pnpm env:check`. The lefthook pre-commit hook runs `pnpm check && pnpm test`.

## Rules for this repo

- Domain logic goes in `packages/core` as pure functions with tests in `packages/core/test`. Functions that create entities take the new id as an argument.
- Web code that can run without a DOM (the IndexedDB store) is tested in `apps/web/test` with Vitest; `test/idb-harness.ts` gives each test a fresh `fake-indexeddb`, separate tabs and a simulated quota. Keep such modules free of imports that run browser code on load.
- The shell owns the session: the `editorMachine` (idle → detecting → editing ⇄ exporting, error) holds the open file's metadata, toasts and the shortcut sheet. Editors talk to the shell only through `EditorCommonProps` (`apps/web/src/editors/types.ts`).
- Editors lay out inside `EditorFrame` (`apps/web/src/components/EditorFrame.tsx`): the file fills the window, one floating tool bar sits at the top center, and the active tool's options show in a row beneath it. On phones (`< 640px`) both move to a bottom thumb-zone dock: options pill above a tool rail of labeled tiles (give each tool `HintButton` a one-word `mobileLabel`). Keep stage content clear of it with `pt-[var(--dock-top)]` and `pb-[var(--dock-bottom)]`.
- Editors register header actions with `onRegisterActions`; `exportFormats` puts the format menu on the Export button. `exportFile` may return a promise; the shell shows progress and the result toast, so editors throw on failure and do not toast success themselves. `appendFiles` makes the drop overlay offer "Add to canvas".
- Keyboard: the shell handles `global.*` actions; each editor listens for its own scope with `matchKeybind(event, "<kind>")` and skips events from text fields (`isEditableTarget`). Add shortcuts to `KEYBIND_CATALOG` so the `?` sheet lists them.
- Create object URLs with `useObjectUrl` (`apps/web/src/lib/use-object-url.ts`), not `useMemo`; StrictMode would revoke a memoized URL.
- Editors are lazy-loaded chunks. Import heavy libraries (mediabunny, @zriz/react) inside the editor, not in the shell.

## Graphical UI

- Theme source: `apps/web/src/components/graphical/` (import from its `index.ts`). `theme.ts` keeps its captured identity (`theme.name: "Forma"`, `name: "edit.here"`); do not edit it by hand.
- The vendored files carry type-only patches so they compile under `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (non-null assertions on index reads, `| undefined` on optional props, one `MotionStyle` cast in `tabs.tsx`). Runtime behavior is unchanged. A Graphical package update will drop these patches; re-apply them and run `pnpm typecheck`.
- Tailwind tokens in `apps/web/src/styles/app.css` alias the theme's CSS variables (`bg-canvas`, `text-ink-muted`, `bg-n3`, `text-brand`, ...). Use them instead of literal colors.
- Fonts are self-hosted in `apps/web/public/fonts` (Inter registered as `"Sidebar Inter"`, JetBrains Mono for keycaps and timecodes). App icons are Hugeicons (`@hugeicons/core-free-icons`) through `apps/web/src/components/Icon.tsx`; size them with a `size-*` class. `lucide-react` stays only for the vendored Graphical components.
