---
name: graphical-cleanup
description: Analyze an existing app's style sprawl and create a local report with its real interface shown before and after a proposed consolidation. Infer values from the app and fit them to Graphical's token structure. Use for cleanup research and conversion proposals, not installing a preset theme or applying changes to the app.
---

# Graphical Cleanup

Produce a local analysis page that makes a proposed simplification tangible. Start with the app's actual homepage or core screen, with an **Original / Consolidated** toggle. Follow it with a concise overview and grouped comparisons of authored values. The app supplies the visual language and representative values; Graphical supplies a vocabulary for organizing them.

This is a research workflow. Creating the report does not install a theme or apply cleanup to the app. Do not add cleanup as a prerequisite or completion step for installation. A request to apply an approved proposal is a separate implementation scope; honor authorization already given without asking for it again.

## Establish the report scope

Identify the source app, the requested coverage, and the destination for the report. They can be different projects. Analyze the current working tree unless the user specifies another snapshot; preserve local edits and identify them in the report's provenance. Read source code and styles without changing the app's existing screens, tokens, dependencies, or runtime configuration. Create only the report and its isolated supporting files in the authorized destination. Follow that project's native runtime and review policy; do not introduce hosting, deployment, backend services, or an installation framework for this report.

Select a real core route with representative UI. Inspect its shared components and the cascade before building the preview. The report can cover more values than this one screen uses; distinguish inventory coverage from preview coverage.

## Read the token contract

Locate these files from the receiving project or supplied Graphical package root, not relative to this skill. Installed skills may live in `.agents/skills/`; ZIP copies may live in `skills/`. Read the first three files, then follow the theme index to the applicable example:

| Read | What it defines | Use it for cleanup |
| --- | --- | --- |
| `GUI.md` | Entry guide and routing to the other references; it is not the token schema. | Establish the package layout and project ownership rules. Do not run its installation steps. |
| `gui/foundations.md` | Canonical token names, capacities, units, and usage rules. | Define the allowed destination slots. |
| `gui/theme-contract.md` | Shared definitions, aliases, mode resolution, and component assignments. | Determine which proposed relationships the system can represent. |
| `gui/themes.md` → `gui/themes/<id>.md` | Generated examples: foundation JSON, light/dark CSS variables, and links to component assignments. | Read the actual data shape and variable names. Derive replacement values from the app being analyzed. |
| Linked `gui/themes/<id>-components.md` | Effective assignments by component, part, variant, state, and mode. | Check relevant assignment constraints; do not copy the example theme's appearance. |

Theme files are generated into the download; a source checkout may contain only the shared Markdown templates. Use supplied references when available. If a required definition is missing, name the gap and keep affected assignments provisional. Do not invent the schema or fetch/install a theme to complete this research task. Read these files as reference material; their conversion and asset-installation actions do not apply here.

## Target token set

Build the proposal using the vocabulary below. Verify it against the supplied `gui/foundations.md` and theme reference; those files own the current contract. These names constrain organization, not pixel values, colors, or font choices.

| Foundation | Destination slots |
| --- | --- |
| Font families and weights | Roles `body`, `display`, `data`; each has a family stack and `regular`, `medium`, `heavy` weights. |
| Font size | Two scales with seven steps each, `xxs` to `xxl`: body for body and data text, display for display text. |
| Line height | Seven steps with the same keys. The current contract stores a size/line-height pair per text step. Fit and display separately, then verify that the proposed combinations are representable. |
| Letter spacing | Five steps: `xs`, `s`, `m`, `l`, `xl`; keep default size-to-tracking aliases distinct from explicit overrides. |
| Spacing | `zero`, `xxs`, `xs`, `s`, `m`, `l`, `xl`, `xxl`; larger or negative distances may reference these steps through evidenced expressions. |
| Corner radius | `zero`, `xs`, `s`, `m`, `l`, `xl`, `full`; zero and full retain their functional meaning. |
| Stroke width | `none`, `s`, `m`, `l`. |
| Elevation | `s`, `m`, `l` are complete shadow recipes; `none` is absence. Preserve distinct component shadow stacks as contextual assignments. |
| Palette colors | `color-1` plus optional `color-2` through `color-10`; do not invent colors to fill unused slots. |
| Neutrals | `neutral-1` through `neutral-10`, with values resolved per mode. |
| Status colors | `success`, `warning`, `error`, with values resolved per mode. |
| Color opacity and None | Each real color has a `-translucent` and a `-transparent` level, each with authored opacity per mode. Additional alpha recipes need explicit treatment. All share the base color; `none` is functional transparency. |
| Motion | Small and Large motion roles with their duration/easing or spring data. Do not collapse unrelated timing behavior into these roles. |

Preserve the source app's established values: a dominant 15px size can remain 15px. Preserve useful existing names as aliases to proposed slots. Fit within the actual shared capacity; unused slots, retained exceptions, and unsupported combinations must remain explicit. The detailed fitting and compatibility rules are in [Analysis method](references/analysis-method.md).

## Analyze and propose

Read [Analysis method](references/analysis-method.md) for inventory, normalization, fitting, and color decisions. Adapt collection to the app's actual stack: utilities, CSS, CSS modules, CSS-in-JS, design-token files, native style objects, or a mixture. A utility search alone is not an app-wide audit.

Record definitions, use sites, counts, theme/brand scope, conditions, dependencies, and source evidence. Find shared-component anchors and preserve meaningful exceptions. Fit compatible observations into the available slots using representative values already authored by the app. Frequency helps select representatives; it does not override semantics, layout constraints, readability, or a shared component used across many screens. Reconcile all groups against shared slot capacities and verify that combined assignments are representable before calling a mapping compatible with Graphical.

Cover font families and roles, weights, font sizes, resolved line heights, letter spacing, spacing, radius, stroke width, colors, shadows, and motion when present. Mark uninspected dimensions and unresolved mappings. Keep functional geometry and effects distinct where a numeric merge would change behavior.

Before building the page, produce three linked data sets within the local report implementation:

1. **Current inventory:** authored values and expressions, scoped source evidence, usage counts, and unresolved contexts.
2. **Proposed token table:** each used destination slot, its source-derived value, units/mode, and supporting rationale. Mark unused slots and contract gaps; do not silently fill them with preset values.
3. **Conversion map:** every inventoried observation maps to a proposed slot or derived expression, stays as an explained exception, or is marked unresolved. Include the conditions where the mapping applies and whether the preview implements it.

Use those data sets for the overview, grouped comparisons, and preview substitutions. They are report data, not a new runtime package or an applied migration.

## Build the report

Read [Report page](references/report-page.md) before implementing the page. Reuse the literal source UI with its original tokens and cascade for the first preview state. Drive the second state from the same content and structure through the report's proposed mapping. Do not create a generic lookalike or silently apply unrelated Graphical styling.

Show each destination once beside all original values that consolidate into it. Group neutral colors before chromatic colors, and keep modes separate. Count a color and its translucent uses as one base color. Include brief reasons for consequential changes, retained exceptions, source provenance, and coverage limits. Lead with per-foundation comparisons; omit aggregate scorecards by default. The report is read-only except for the comparison controls needed to understand the preview; omit scale editors, filters, sorting controls, and install/apply actions.

## Verify and deliver

Check that every displayed destination, count, and preview substitution comes from the same proposal data. Verify Original resolves to the source values and Consolidated changes only mapped properties. Use the destination project's permitted checks, proportionate to the work. Browser inspection is not implied permission to bypass a project that reserves it for the user.

Finish with the report URL or file, what was covered, the strongest supported consolidation opportunities, and material preview or analysis limitations. State which checks actually ran. Do not claim visual fidelity, rendered accessibility, complete coverage, or measured productivity/performance gains from source inspection alone.
