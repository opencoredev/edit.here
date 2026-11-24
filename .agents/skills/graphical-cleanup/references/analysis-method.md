# Analysis method

Use this when producing the inventory and proposed mappings. The method should reveal an app's implicit system, not replace its identity with a preset.

## Inventory with context

Start from the app's styling entry points, token definitions, shared components, and representative consumers. Use the current working tree unless instructed otherwise. Record the base revision when available, whether included files have local edits, the snapshot date, and the included/excluded paths. Do not identify modified source solely by its HEAD revision. If source changes during analysis, refresh affected observations or disclose the snapshot mismatch. Inspect all relevant authoring mechanisms within scope; enumerate gaps such as inline styles, runtime calculations, third-party widgets, or inaccessible routes.

For each observation retain:

- Property family, authored literal/expression, original unit or color notation, resolved samples, and alias/dependency chain where known.
- Definition and use-site evidence: file, line, selector/component, and alias names.
- Lexical source occurrence count, with the counting rule and exclusions.
- Role and context: control, body text, heading, display text, metadata, geometry, category, status, or decoration.
- Theme/brand and scope owner, mode, viewport/container condition, interaction state, inheritance origin, and relevant foreground/background pair. Include language/script when it affects typography.
- Confidence, unresolved dependencies, and reason for any protected exception.

Count unique normalized values separately from token names and semantic roles. Several names may resolve to one paint; one name may resolve to different paints across modes. Count shared definitions and their consumers transparently rather than counting a definition twice as two rendered uses. Source frequency is evidence, not a census of visible UI. A shared page title can matter more than many copied marketing utilities.

Keep independent theme/brand scopes distinct during inference. Identically named variables in nested scopes can intentionally resolve differently. A value inventory may deduplicate equal colors within its declared scope without merging their semantic roles or authorizing one replacement across all their uses. Cross-scope consolidation requires evidence that the distinction is accidental or an explicit request to unify it.

Exclude dependencies, generated output, inactive code, and unrelated assets from authored-sprawl counts unless they are explicitly in scope. Read dependency-provided resets or component styles when needed to resolve the source cascade and reproduce Original faithfully. Exclude illustration and artwork paint from interface color consolidation. Classify mixed-use colors at the observation level: removing an artwork use must not discard the same color's real UI uses. Retain functional icons, text, backgrounds, controls, charts, focus, and state colors. Separate decorative effects and external widgets when their constraints differ.

## Normalize equivalence, preserve behavior

Resolve aliases through the actual cascade and theme configuration where possible. Deduplicate equivalent numeric values without losing their provenance.

- Convert `rem` only with an evidenced root size or an explicitly stated assumption. Do not treat an assumed conversion as a measured value.
- Trace `em`, percentages, inherited values, and expressions through their actual parents and use sites before classifying them as unresolved. Map their effective values when the context is established. One authored relative rule can have several effective values and destinations; keep that one source observation with the context-specific mappings instead of counting it several times. Preserve genuinely dynamic viewport or variable-dependent behavior. Zero may be numerically equal across units but can still serve a protected functional purpose.
- Keep percentage and unitless line heights distinct: inheritance behavior differs. Record effective size/line-height pairs for the shared components that anchor the proposal.
- Normalize equivalent color syntax in a declared color space without prematurely rounding away differences. Keep alpha, color mode, and composite context. Transparent black is not a black palette step.
- Keep equivalent values with incompatible purposes distinguishable in mapping rules. A fixed control height, spacing step, and motion distance need not share a replacement merely because their numbers match.
- Preserve expression relationships when proposing substitutions. `currentColor` follows its owning foreground; scoped `var()` references, fallbacks, inheritance, and fluid expressions must retain their behavior. A resolved sample is evidence for fitting, not permission to replace the expression with a constant. Transform the appropriate definition or an evidenced use site; retain unresolved expressions when a safe contextual transformation is unavailable.
- Respect platform units. Native layout units and font scaling are not CSS pixels; record the platform and scaling context instead of reusing browser conversion assumptions.

## Infer the source system

Read the Graphical vocabulary from the supplied foundation reference. Slot names and capacities constrain organization; their default numbers do not constrain the fit.

Identify anchors from repeated component recipes, dominant body/control typography, clear hierarchy, important state distinctions, and geometry. Record why each anchor is protected and the evidence for it. Do not carry an earlier app's anchor names, chosen numbers, thresholds, or exemptions into a new app without fresh evidence.

Split incompatible contexts before fitting. Useful distinctions can include body versus display typography, small diagram labels, responsive variants, data tables, fixed control geometry, and animations with a functional duration. Decide these from actual usage rather than creating a blanket exemption for every unusual value.

Partitioning observations does not multiply the destination's capacity. Keep one slot-assignment ledger per scope supported by the actual contract. Reconcile candidates from UI, marketing, and other contexts against it; do not grant each group a fresh seven-step scale unless the contract supports independent scales. If protected distinctions cannot fit, identify the conflict and retain them or describe a required contract extension.

A useful numerical fit selects observed representatives (weighted medoids):

```text
observations = distinct authored values with source counts and contexts
anchors = observed values protected by documented component/semantic evidence
budget = compatible capacity in the shared destination slot ledger

choose at most budget representatives from observations
require anchors to remain representatives
minimize sum(count(value) * distance(value, compatible representative))
break equal costs by stronger observed support, then a stable ordering
retain unresolved or incompatible observations as explicit exceptions
```

Absolute distance suits many linear quantities; log distance can reflect proportional change for positive sizes or spacing. Select and disclose the metric. Handle zero and negative values separately where a log metric cannot apply; preserve sign for valid offsets. Do not average new values into existence merely to make a smoother mathematical scale. Do not force unused slots to differ or fill them with defaults. If protected anchors exceed the budget, expose that conflict instead of silently deleting a distinction.

Frequency is one input, not the complete decision rule. Being outside the proposed scale's minimum or maximum does not automatically justify an exception. Small sizes can converge on the smallest shared step; larger sizes can converge on the largest when the requested simplification permits the hierarchy change. Review cluster boundaries, fixed container fit, and visible risks after fitting. A proposal that changes many values by little can be useful, but loss of a meaningful hierarchy is not justified by a lower distance score.

### Typography and geometry

Use the original font size and inheritance to resolve relative line heights, then fit the resulting pixels to a separate line-height scale. Report each destination once with its line-height slot and pixels; do not force a font-size pairing or map every relative rule at one assumed body size. Match to the nearest line-height representative, using source frequency and established component recipes to choose the representatives. Preserve functional zero. A single unitless rule can resolve differently in descendants; percentage or length leading may instead inherit its computed length. Account for responsive font-size utilities that also override leading. Document rounding only when the contract requires it.

Before presenting the proposal as representable, check its actual font-size/leading/tracking combinations against the destination's coupled assignments and supported overrides. Independently fitting each scale does not establish that every combination is expressible. Record a supported assignment, a retained contextual exception, or an explicit contract gap for each conflict. Keep an exploratory independent-scale proposal labeled as such rather than silently inventing an override or changing pairings during preview implementation.

Fit weights within font roles and the font's supported faces or variable range. Keep body/display distinctions where evidenced; three weights per role does not require every family to use the same three numbers. Preserve authored families by default. Cleanup is not a font replacement exercise. Fit tracking independently, preserving meaningful negative/zero/positive treatments and units.

Preserve complete fallback-stack order, font styles/axes, and language or `unicode-range` font-face routing. Different scripts can need different leading and tracking despite sharing a CSS family declaration. Use representative source text for inspected languages; label coverage limited when only one script or an unavailable fallback face was examined.

Keep zero and full/pill radii distinct from ordinary fixed corner sizes. Relative radii remain contextual unless their behavior is established. Fit common spacing from actual UI usage; state any frequency cutoff rather than presenting it as a universal rule. Review larger spacing beyond that cutoff: existing multiples of meaningful shared steps can be derived expressions instead of independent exceptions. Preserve signs and responsive contexts. Distinguish this reduction in independent constants from a reduction in distinct rendered values; an unchanged dimension expressed as twice a token is still the same rendered value. Retain geometry-coupled alignment, deliberate marketing composition, layout widths, and fluid expressions where their context warrants it, with a concrete reason.

Classify stroke widths, shadow recipes, and motion by purpose before combining them. An inset edge, an elevation shadow, focus, and a glow are different effects. Preserve ordered shadow layers and opacity. Immediate behavior, debounce delays, looping animation, and interface transitions are not interchangeable durations. Leave these dimensions unresolved when source evidence is insufficient; report that limitation instead of manufacturing a two-value scale.

## Consolidate colors by meaning and perception

Separate neutrals from chromatic colors, then inspect semantic groups and both modes. Use actual surfaces, text levels, fills, borders, accent, status, and category definitions as evidence for anchors. A low-chroma threshold can identify candidate neutrals, but disclose the threshold and manually inspect tinted grays. Do not turn a semantic green into a neutral because it is dark.

Within a compatible group, perceptual distance such as Euclidean OKLab can identify near duplicates. Use a tested conversion appropriate to the source color spaces; raw hex or RGB channel distance is not perceptually uniform. Select representatives from the source's supported paints, weighted by usage and protected semantic anchors. A threshold or nearest-color result is a candidate mapping, not proof that a difference is invisible or safe.

Related shades can share one paint while their source role names remain distinct. Preserve distinctions that communicate status, categories, selection, focus, or contrast. Where an aggressive proposal deliberately reduces category hues or state differences, make that visible as a tradeoff rather than labeling all those roles equivalent. Do not preserve every historical error shade as a new exception solely because its name differs.

Treat light/dark role correspondence together. Different modes can need different representative values while retaining the same purpose. Validate proposed foreground/background combinations in their actual states and surfaces when possible; otherwise mark contrast as unverified. A palette distance calculation is not a contrast check.

Count a base color and its opacity variants as one palette color in both current and proposed inventories. Compare uncomposited color channels in the declared color space; white at several opacities is one color, while a separate opaque gray remains a separate observed color until a merge is proposed. Count colors used only translucently too. Unresolved `currentColor` or variable references are dependencies, not invented new colors. Keep alpha recipes available as separate evidence, without adding them to the color total; None is functional, not a palette color. Graphical offers two translucent levels per color, translucent and transparent, each with an authored opacity; their default opacities are not a requirement to replace every source alpha. Fit an appropriate source-supported opacity where justified, preserving additional functional recipes as exceptions. Do not silently replace a pale solid with translucent paint: that changes compositing and needs a stated background-dependent tradeoff. Preserve full transparency for functional None.

## Proposal evidence

Use one mapping model for report groups and the preview. Each decision must connect:

- **Source:** stable observation identity, evidence path, property, authored expression and dependencies, scoped conditions, and evaluated samples.
- **Proposal:** destination slot/value or derived expression, the exact scope/use sites where it applies, and destination-contract compatibility.
- **Decision:** merge, retain, or unresolved; rationale and consequential tradeoffs; whether it is actually wired into the selected preview.

If one source expression has several contextual destinations, preserve the conditions rather than flattening them into a global replacement. If two mapping rules match the same context with different results, resolve the conflict before substitution; otherwise retain the original and label it unresolved. Unresolved values are not successful merges.

Report current and proposed values by foundation, with source occurrences, retained values, changes, and exceptions. Distinguish palette colors, alpha recipes, and semantic roles. Record explicit dependencies for derived variants; equal pixels or labels do not prove reuse. Keep the report focused on these comparisons rather than an aggregate scorecard.

If improvement metrics are requested, use comparable before/after scopes and counting rules. Unknown existing token reuse is not zero. Count each authored value once within its foundation/mode even when it resolves to several contexts, and disclose how modes and functional values are handled. Distinguish value coverage from occurrence coverage when inventories lack comparable use counts. Opacity and multiplier recipes still exist even when they share a base token, so fewer bases do not prove an equal reduction in decisions or work. Do not claim measured runtime, bundle-size, or development-time savings. Human-curated anchors and incomplete coverage remain limits of the research.
