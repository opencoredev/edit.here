---
name: graphical-convert
description: Apply a supplied Graphical theme to an existing interface, including partially converted apps. Map visual roles to the requested theme while preserving behavior and useful structure. Embedded package imports use graphical-import; later editor batches and package updates use graphical-adopt.
---

# Convert an interface to Graphical

Use this for supplied-theme adoption, including partially converted apps. A successful conversion makes the requested screens and components express the agreed theme through the app’s existing styling system. Updated global tokens alone are not completion. Follow a planning-only request without editing source; a request to implement conversion authorizes scoped implementation and its follow-up repairs. Do not add a mandatory approval round for routine mappings.

When an embedded installation prompt invokes `graphical-import`, follow that skill’s analysis, fit-and-convert implementation, and brief verification instead. Do not run this workflow or its audit pass as an extra import stage or re-ask its established scope. Later editor change batches, imported-theme changes, and package updates use `graphical-adopt`.

## Establish scope and target

Identify the requested app, feature, or screen and the supplied target theme. Read the project root `GUI.md`, `gui/theme-contract.md`, `gui/foundations.md`, `gui/components.md`, and the relevant theme in `gui/themes.md`. Follow their links to the exact specification for each selected theme/component, including structure, behavior, named assignments, parts, variants, sizes, states, modes, and resolved styles. Preserve authored component edits rather than approximating them with a similar preset or unmodified library defaults; global values alone do not describe the conversion. Locate these from the app root; if the guidance has not been added yet, follow the project setup steps in `GUI.md`. Do not invent a theme, registry URL, or package source when the required artifact is missing.

Inspect the styling system, shared components and their consumers, mode wiring, and existing customizations. Use an explicit scope already supplied by the user, including the saved full-component setup selection in `GUI.md`. That selection authorizes applying the theme to the existing app and implementing all supported Base UI components without another scope question; honor any narrower explicit request. Otherwise ask once how to apply the theme, explaining the reach of shared changes:

- **Convert the whole app** — update existing shared components and their usage across screens.
- **Convert selected areas** — identify pages or components to convert, accounting for shared definitions used elsewhere.
- **Keep the current UI for now** — retain the guidance for future work without changing existing runtime styles.

Carry the answer into conversion and audit without asking again. Resolve unnamed selected areas before editing. For guidance-only setup, finish with where the guidance lives and stop without applying global tokens or component changes.

Use `gui/theme-contract.md` to distinguish conversion from simplification: conversion defines the supplied token vocabulary in the host app; simplification preserves established values and relationships. Neither authorizes inventing additional theme choices.

## Map roles in context

Read [mapping examples](references/mapping-examples.md), including the shadcn guidance when applicable. Trace representative consumers through tokens, aliases, utilities, shared components, inheritance, and local overrides to the effective declaration. Include screen typography, navigation, repeated surfaces, and popups as well as named library controls. Identify where a shared change reaches beyond the requested scope.

Map by purpose, hierarchy, density, and state, preserving the contextual relationships in `gui/theme-contract.md`. Equal values need not share a role; a resolved sample need not be the owning value. Keep confirmed mappings, supported exceptions, and unresolved gaps distinct. Existing library defaults alone do not establish an intentional exception, and a mapping must not erase a required distinction.

Preserve dependencies and application behavior. Define the referenced values as named tokens in the app’s existing theme system; do not assume bundled component source or replace the host app. Read `gui/assets.md` and the target theme’s **Font and icon setup** section to identify official sources, required weights, and licensed-asset fallbacks. Include asset setup in the conversion map; a planning-only request describes it without installing anything.

The explicit embedded import fits values to Graphical’s scales under `graphical-import`; do not replace that process with value-preserving cleanup.

For planning, deliver the mappings, affected shared definitions, gaps, and relevant checks without implementing. For implementation, continue with known mappings; ask only about missing decisions that materially affect the result.

## Apply the intended result

A variable change does not prove its consumers use it. Match semantic purpose rather than the nearest numeric value, preserve foreground/background pairings, meaningful aliases, and responsive or inherited relationships, and never map a required distinction to an indistinguishable treatment just to complete the table. Preserve an exception when user direction or project evidence supports it.

For a full-component download, integrate the actual bundled `components/graphical/` source rather than reconstructing the library from specifications. Use its public `index.ts` exports, import `styles.css` once, and connect `GraphicalProvider` to the captured `theme` document and app color mode under `gui/base-ui.md`. Preserve the user’s component edits and the shared runtime while adapting existing consumers. Install only missing `@base-ui/react`, `motion`, and `lucide-react` packages according to the receiving project’s version policy; configure assets separately. For guidance-only setup, source and runtime dependencies are not included, and implementing components still requires a scoped UI request.

For selected areas, contain both token and component changes using supported scopes or variants. If isolation is unavailable, resolve that scope conflict before changing unrelated screens. Remove superseded styles only after confirming their consumers are covered.

1. Connect the target theme and styles at the existing application boundary. Install and configure the selected free fonts and icon pack under `gui/assets.md`; for unavailable licensed selections, install the named free fallbacks and record the vendor links and steps for adding licensed assets later. Keep mode ownership in the app. Avoid nested static providers and competing global resets.
2. Adapt shared style/token boundaries and component definitions before leaf overrides. Apply the effective assignments for each relevant variant, size, part, state, and mode, including typography, spacing, radii, fills, borders, shadows, and motion. Global token changes alone do not complete a component conversion.
3. Convert the requested screens and relevant states, including typography bundles, surfaces, icons, responsive spacing, and portal scopes. For a limited-scope conversion, isolate both token and component changes with the app’s supported scoping or variant mechanisms. Do not unintentionally retheme unrelated screens through shared definitions. If isolation is unavailable, resolve that scope conflict with the user before the broader change. Delete superseded styles only after confirming their consumers are covered.
4. Preserve routing, data, public component APIs, handlers, refs, form values, keyboard interactions, accessible names, and state distinctions. Replacing the app’s primitive library is not an incidental conversion step. Preserve dependency versions, ranges, overrides, and lockfile choices; validate APIs against installed versions and add only missing packages under the receiving project’s policy. Read `gui/base-ui.md` for Base UI primitives or `gui/custom-components.md` for adaptations.

Use `gui/interface-judgment.md` for composition and `gui/foundations.md` for typography, wrapping, surfaces, and motion. Preserve requested content and useful structure while removing redundant styling; theme adoption is not a reason to embellish the interface.

## Verify and report

Finish implementation with the included `graphical-audit` skill, using the agreed target, mappings, and supported exceptions. Find and fix remaining conversion gaps within that scope. This pass is part of the conversion; do not ask for approval again or broaden it to unrelated areas.

Follow `gui/verification.md` and the host’s review policy. Confirm that intended definitions reach actual consumers in relevant states and modes; reinspect remaining overrides and theme propagation into portals. Check affected behavior when component wiring changed. Do not describe source checks as visual review or rendered equivalence.

Report actual component coverage with a reason or evidence for each status: **converted**, **already matches**, **intentionally preserved**, or **blocked**. Use **already matches** only after comparing the relevant assignments, modes, and states. For full-library setup, include usable component import paths and additional primitives without an exported specification. Name any uninspected scope, asset substitutions, and unresolved fidelity gaps; do not claim completion while components remain blocked or unreviewed, or when only tokens or dependencies were installed. Include important mappings and actual verification, grouping gaps by their owning component or style source so a later pass can continue without repeating discovery.
