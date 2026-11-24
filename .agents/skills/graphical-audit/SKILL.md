---
name: graphical-audit
description: Audit a Graphical app, feature, or change for theme drift, one-off styling, undefined tokens, and inconsistent component treatments. Confirm issues in context and recommend existing-theme mappings; apply repairs when requested. Use for finding or fixing styles that bypass the active theme, not as an automatic embedded installation step.
---

# Audit Graphical theme drift

Find where the requested UI fails to express its intended theme, using actual definitions and consumers. Different values are not automatically drift, and fewer tokens are not automatically a better result.

An audit is read-only unless the user asks for repairs. “Audit and fix” authorizes fixes within the requested scope; do not require another approval for each confirmed mapping. This is an evidence-based agent audit, not a claim that a deterministic linter has checked every rendered state. Registering this skill does not invoke it: `graphical-import` owns initial embedded conversion and verification, and `graphical-adopt` owns later editor batches and package updates.

## Establish the baseline

Resolve the requested screen, feature, change, or codebase scope. Read the app root `GUI.md`, `gui/theme-contract.md`, and `gui/foundations.md`; locate them from the project root, not this installed skill. Identify active themes, intentional customizations, aliases, primitives, and shared component conventions. Current source owns deliberate local changes; `gui/themes.md` is a reference snapshot.

For an authorized conversion follow-up, use the agreed target, component mappings, and documented intentional exceptions as the baseline, including the selected setup recorded in `GUI.md`. Read `gui/components.md` and compare each component against its exact linked specification. Inspect coverage against the effective assignments linked from `gui/themes.md`, including parts, variants, sizes, states, modes, and portals. Check that authored component edits survived implementation; global tokens or a similar preset do not establish a match. Unchanged library defaults are not intentional customizations merely because they are in current source. A `graphical-convert` implementation includes repairing remaining gaps within that scope; do not add this pass to an embedded import or editor update automatically.

For ordinary simplification of an adopted UI, assess duplicate ownership and unnecessary overrides while preserving established values and relationships. Do not use an audit to redesign the app, flatten semantic roles, or introduce a new scale. An explicit fit-and-convert import follows its own `graphical-import` rules; evaluate it against the agreed conversion rather than requiring every pre-import value to remain unchanged.

## Confirm issues in context

Read [drift rules](references/drift-rules.md). Search relevant styles, utility configuration, component definitions, and local overrides, excluding generated output, dependencies, and unrelated assets. Locally owned vendor components may contain the cause and are not automatically exempt.

Search results are candidates. Trace effective declarations through aliases, cascade, inheritance, responsive conditions, modes, and states to their consumers. Verify that a treatment contradicts the intended role and that the replacement exists and preserves its meaning. Preserve expressions, units, semantic aliases, and foreground/background relationships; value equality is insufficient evidence. Read `gui/base-ui.md` or `gui/custom-components.md` when the issue involves component integration.

Check coverage beyond token definitions and named controls: headings, body text, navigation, repeated surfaces, and popup content can retain independent styling. A changed variable does not prove compiled utilities or inherited fonts use it. Group repeated symptoms at the shared cause, identifying affected consumers and the reach of a proposed repair.

When the full-component source is included, verify that consumers use the supplied `components/graphical/index.ts` exports, `styles.css` is loaded once, and `GraphicalProvider` receives the captured theme and actual color mode. Check that the shared runtime, authored component edits, and portal styling remain connected. A reconstructed approximation is not equivalent to using the bundled source. Check only missing runtime dependencies were added under the app’s version policy; guidance-only installation should add no source or runtime dependencies. Preserve explicit app-level adaptations and report their effect rather than assuming the source guarantees a rendered match.

For font or icon issues, verify families, weights, aliases, icon exports, and fallback decisions against `gui/assets.md` and the theme’s **Font and icon setup**. A read-only audit reports gaps; authorized repairs follow the asset guide’s file-request and fallback policy. A fallback chosen under that policy is not theme drift.

Use `gui/interface-judgment.md` for composition findings and `gui/foundations.md` for wrapping. Keep them distinct from token drift and preserve requested content and necessary instructions. Intentional customizations, valid aliases, structural geometry, artwork, and data encodings need context, not blanket replacement.

## Report or repair

Use [the report format](references/report-format.md): scope, prioritized findings, existing-theme replacements, coverage, and verification. Cite current file/line evidence and explain the consequence. Separate genuine theme gaps and uncertain mappings from confirmed fixes. No findings is a valid result; never pad the report.

If repairs are requested, fix confirmed causes at their owning source using verified existing tokens and supported component variants. Check the reach of shared changes. Preserve behavior, public component APIs, supported modes/states, intentional exceptions, and dependency choices. A missing suitable token is a theme gap, not permission to invent one. Leave ambiguous semantic mappings explicit while completing independent fixes. Reinspect affected consumers under `gui/verification.md` and the project’s policy.

Finish with what was found or fixed, component coverage and usable import paths, asset substitutions, unresolved fidelity gaps, and what was actually verified. Full-library setup requires implemented reusable modules, not only tokens or dependencies. Do not claim visual fidelity, rendered contrast, or complete coverage from source inspection.
