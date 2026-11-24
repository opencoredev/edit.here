# Report page

Use this when implementing the local output. It should let someone understand the existing system, see the proposed result in their actual UI, and inspect what would merge.

## Actual interface first

Place the source app's real homepage or selected core screen at the top of the overview. Default to **Original**, with a clear **Original / Consolidated** toggle. Put the executive summary immediately below it. A generic dashboard, remembered approximation, or unrelated component gallery does not satisfy this preview.

Trace the selected route into its layout, components, markup, responsive behavior, styles, assets, font declarations, and representative data. Reuse source components when they can run safely in the report, or copy their view markup and necessary styles into an isolated report implementation. Preserve layout, hierarchy, labels, icons, spacing relationships, and relevant component anatomy. Do not recreate the interface from a short description.

Inspect import/setup/mount behavior before reusing a route component. It may fetch data, redirect, initialize analytics, or write state before any click. Use a fixture-backed presentation copy or isolated stubs when those effects cannot be excluded. Disabling visible controls alone does not make the preview inert.

When the report lives in another repository or runtime, adapt only the integration needed to render that view. Source inspection should determine equivalent resolved values, not a framework's unrelated defaults. This can be server templates, DOM/CSS, native view structures, or another rendering system; React and Tailwind are not prerequisites. If a faithful live copy cannot be produced with the available source/runtime, report the concrete gap and label partial output honestly instead of calling an invented lookalike the real app.

Use one shared view, dataset, and set of assets for both toggle positions. Hold mode, viewport, breakpoints, content, state, font loading, and structural layout constraints constant. Only the audited mapping may differ. Resulting text wrapping or element dimensions can change because a mapped token changed; do not independently redesign the proposed version to make it look better.

The Original branch must resolve to the actual source values, including inherited typography, reset styles, variable aliases, and utility precedence. Audit relevant computed rules from source and, when permitted, rendered styles. Do not apply Graphical defaults, a new typography reset, or global report styles to both branches and then call the first one Original.

## Isolated substitution

Keep report chrome and the copied interface in separate style scopes. Prevent both copied app styles and proposal overrides from affecting the surrounding report or the source app. Use the destination's established isolation mechanism; preserve theme scope for any rendered portals. Do not change the source app's global styles or shared components merely to make the report work.

Build a resolved style adapter from the same proposal data that powers the comparison rows:

```text
resolve(source observation, scoped conditions, preview choice):
  if Original: preserve source declaration and dependencies
  match mappings by observation, property, role, theme/brand scope,
    mode, state, viewport/container condition, and inheritance context
  if exactly one reviewed, supported mapping applies:
    apply its transformation while preserving expression dependencies
  otherwise: preserve source declaration; record ambiguity or missing coverage
```

A global text replacement or nearest-value lookup that ignores context can apply the wrong mapping to geometry, icons, colors, or functional zero. Trace every preview substitution to a real matching source property. Keep `currentColor`, aliases, inheritance, and fluid relationships live; a resolved sample must not silently freeze them. If the inventory has a proposed mapping but the preview has not wired it, report it as not previewed rather than implying full coverage. Do not substitute a different supported assignment merely to hide a contract gap in the proposal.

Use the app's actual available fonts, weights, icons, and assets under their existing permissions. Loading different fonts in the two versions invalidates a token-only comparison. Do not fetch trial or paid assets, substitute fonts silently, or claim font fidelity when the real asset is unavailable. Disclose unavailable families or weights and any explicitly permitted fallback. Font and icon acquisition is not implied by a read-only cleanup analysis; follow any separate authorization and the project's asset policy.

Use representative local fixtures when live data, authentication, or services are unavailable. Preserve realistic text lengths and the real component structure; label the fixture and the source route. Do not copy unnecessary private data into a portable report. Keep actions inert or confined to harmless local preview state, and disclose missing interaction/state coverage. The comparison does not require connecting production services.

## Read-only analysis below

Use the destination app's established report/editor typography, neutral palette, spacing, and control styles. Keep containers minimal: a preview, a short summary, and flat value comparisons. Avoid decorative labels, repeated caveats, filler copy, and a dashboard of cards.

Keep the overview compact: follow the preview with straightforward current/proposed comparisons for each foundation. Do not add headline scores or an aggregate scorecard by default. If the user requests improvement metrics, give each one a comparable current baseline, proposed result, and plain counting label. Proposed token coverage alone is not improvement over an unknown baseline, and overlapping measures are not additive benefits. Add brief notes only for consequential tradeoffs; keep formulas, provenance, and uncertainty in the evidence section. Do not label value reduction as measured productivity or performance.

Organize the comparisons by foundation. In each group, keep originals on the left and the consolidated destination on the right. Show the destination once spanning all source values that merge into it; a four-to-one group must not repeat the destination four times. Show source counts and concise provenance without letting token names dominate the actual values.

Group colors into neutrals first, then chromatic colors, with status/palette meaning available as context. Keep light and dark mode inventories separate. Count a base color and all its opacity variants as one palette color. Show translucent levels or retained alpha recipes beneath their base color when useful, without adding them to the color total. None is functional, not another palette color. Distinguish a paint merge from semantic role renaming; role names need not change.

Use appropriate visual samples: actual type for typography, corners for radius, swatches for paint, and scale/effect samples where they help. Samples must use the reported source and target values. Give line heights the same grouped red/green diff as other dimensions: show resolved original pixels on the left, with the source expression available as evidence, and each proposed line-height slot once on the right. Use a consistent specimen font size to make line spacing comparable, without presenting it as the font-size assignment for that slot. A source rule can resolve to several pixel values; deduplicate equal resolved pixels within each destination group and do not invent source-use counts for the expanded contexts. Count each authored rule once rather than inflating its count when resolving multiple contexts.

Keep unmapped values and retained exceptions legible with brief reasons. Put source paths, counting assumptions, snapshot date/revision, omissions, and verification in a compact evidence section. Source references are evidence, not proof of complete rendered coverage.

The Original/Consolidated comparison is the primary interaction. A mode control is useful when both modes are implemented, but both variants must use the same selected mode. Do not add editable scales, filtering, sorting, changes-only controls, installation buttons, or apply actions to this research output.

## Verification and delivery

Confirm the report compiles in its native destination runtime and that mapping data, counts, grouped targets, and preview substitutions agree. Follow the project's review policy before using browser automation or screenshots. If visual review is left to the user, state that directly.

Check consequential boundaries in the audited source: an inherited or relative value, a mode/scope-dependent alias, a stateful foreground with `currentColor` descendants, and identical numbers used for spacing versus structural geometry when present. Confirm each gets its intended scoped mapping or remains explicitly unresolved. Include relevant responsive and language contexts in permitted review; one desktop Latin-text preview does not verify the whole inventory. Use source tracing or focused existing checks rather than adding a generic test suite.

Check the preview's source fidelity separately from the proposal's quality. An accurate Original and correct mappings do not establish that every proposed merge is desirable. Highlight unreadable contrast, lost category distinctions, clipped content, or geometry changes when evidence reveals them; retain unresolved cases rather than claiming automatic success.

Deliver the local page with a concise description of covered routes/modes, fixtures, font or asset limits, and actual checks. Keep cleanup application separate. Do not add persistence, export systems, remote sharing, or deployment just to present this report.
