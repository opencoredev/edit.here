---
name: graphical-ui
description: Build or edit interfaces in projects with Graphical guidance, even when the request does not mention Graphical. Use the current theme and existing components for screens, layouts, custom markup, charts, and responsive states. Initial import, theme conversion, editor change batches, and drift audits have separate workflows.
---

# Build with Graphical

Use this for ordinary interface work in an app that already uses Graphical, even when the request does not name Graphical. The result should use the app’s existing tokens, familiar components, and intact behavior. A new interface request does not imply whole-app conversion or normalization.

Read the project root `GUI.md`, then `gui/interface-judgment.md` and `gui/foundations.md`; those files own the shared design rules. Locate them from the project root, not relative to this installed skill. Read `gui/base-ui.md` for Base UI components, `gui/custom-components.md` for custom markup and other primitive libraries, and `gui/theme-contract.md` when changing assignments or simplifying shared styles. Follow `GUI.md` for workflow routing: a supplied embedded import uses `graphical-import`, and its later editor changes and package updates use `graphical-adopt`. Neither invokes this skill or `graphical-convert` as another installation stage. Separate supplied-theme conversion uses `graphical-convert`.

Locate the active theme factory/document, mode wiring, component imports, and a nearby example of the requested UI. Read actual declarations and consumers before choosing an unfamiliar token or variant. The generated `gui/themes.md` links to reference values and effective component assignments; deliberate local customizations take precedence.

## Build

1. Start with the simplest complete product UI under `gui/interface-judgment.md`. Build what was requested, and ask whether each element and line of copy should exist before styling or wording it. Reuse existing navigation, layout patterns, and shared components. Preserve the app’s requested content, behavior, and intentional customizations.
2. Choose existing tokens by role. Keep named references for colors, complete typography, spacing, surfaces, icons, and motion. Default wrapping text to `text-wrap: pretty` through the shared typography scope described in `gui/foundations.md`. Verify optional colors, component variants, and part/state identifiers instead of guessing names or inserting raw fallback values.
3. Prefer existing components and supported variants, then compose available primitives. Add a component only for a missing capability, using existing tokens. Use custom markup for application structure; preserve public component APIs, handlers, refs, form behavior, and accessibility. Carry theme variables into portals and keep mode/state changes live.
4. Use Motion for React (`motion/react`) for authored React animation, with the active theme’s authored motion values. Springs use `visualDuration` and `bounce`; retain the primitive’s mount lifecycle and reduced-motion behavior described in `gui/foundations.md` and `gui/base-ui.md`.
5. Cover the responsive, empty, loading, error, disabled, and interaction states the task reaches. Reuse their current treatments rather than inventing another visual vocabulary per state.

When implementing a component, read `gui/components.md` and the exact specification linked for the active theme. Preserve the supplied structure, parts, variants, states, modes, named assignments, and resolved styles, including the user’s exported edits; global tokens, a similar preset, or unmodified library defaults are not a substitute. Additional primitives without a specification use the existing foundations and remain an explicit coverage gap. Honor the saved setup selection in `GUI.md`, while respecting a narrower explicit user request.

When the full-component download includes `components/graphical/`, use the actual supplied source through `components/graphical/index.ts`; do not reconstruct those components from specifications. Follow `gui/base-ui.md` to import `styles.css` once and connect `GraphicalProvider` to the captured `theme` and actual color mode. Add only missing `@base-ui/react`, `motion`, and `lucide-react` packages under the consumer’s version policy. The default guidance-only download adds no source or runtime dependencies; implement only the components an authorized UI task needs.

Trace shared changes through aliases, inheritance, and compiled utilities to the actual consumers. A body font change may not reach headings, form controls, or popup text. Equal resolved values do not make distinct semantic roles interchangeable; preserve intended foreground/background pairings and derived relationships rather than freezing a sampled result. When simplifying an already adopted UI, consolidate equivalent roles without changing established values or relationships unless requested; a cleanup request does not authorize a new scale.

New compositions are allowed. New theme values or parallel scales are not part of ordinary UI work. If no existing choice meets the requirement, identify the missing capability and continue independent work; do not hide the gap behind a new CSS variable or literal fallback. When the user explicitly requests a theme change, make that change at its owning source and explain its shared impact.

For required fonts or icons, follow `gui/assets.md` and the theme’s **Font and icon setup**. The asset guide owns the licensed-font file request, fallback decision, and setup; honor known answers and existing assets.

## Finish

Review the changed consumers for invented tokens, copied snapshot values, unrequested or redundant elements, and unnecessary overrides. Confirm that intended definitions reach them and required distinctions survive. Apply the removal pass in `gui/interface-judgment.md`, including empty states and header/footer copy; a clear title does not need a subtitle. Check the shared pretty-wrapping default without claiming source inspection proves rendered fidelity or line breaks. Use `gui/verification.md` and the project’s policy for affected checks. Keep the result concise: what changed, which existing patterns or tokens it uses, what was verified, and any unresolved theme, asset, or visual gap.
