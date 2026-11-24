# GUI — edit.here design language

This guide and the accompanying skills explain how to use the theme. In a theme download, this file also holds the saved theme: the **Theme values** sections are readable, editable JSON and can restore the theme in Graphical. The `gui/` references describe component structure, behavior, and resolved styles; `skills/` contains workflows for using them. The full-component selection also includes Graphical’s actual themed component source and runtime. The default theme-and-skills selection includes guidance only and adds no runtime source or dependencies.

## Start here

Keep `GUI.md` and `gui/` at the project root. The install command puts the skills in `.agents/skills/`; for a ZIP, copy the folders from `skills/` there, preserving existing files and local edits. Add this pointer to the project’s active agent instructions without replacing them: “For UI work, follow GUI.md and use the current theme with graphical-ui. Follow the workflow guidance in GUI.md for imports, editor changes, conversion, or audits.” Agents with other conventions can read these files directly.

**Embedded editor import:** when the supplied installation prompt invokes `graphical-import`, that skill owns the complete initial fit-and-convert workflow and its brief verification. The prompt already authorizes converting the app’s styles onto Graphical’s system; do not ask the scope question below again or invoke `graphical-convert`, `graphical-audit`, or `graphical-cleanup` as extra installation stages. Keep its analysis, source rewrites, project files, and development-only editor integration. Later editor change batches, theme changes, and package updates use `graphical-adopt`. Registering these skills makes them available; it does not run them.

For a separate supplied-theme setup, inspect the app’s styling, shared components, and consumers before making changes. Honor the selected setup recorded below and any scope the user already gave. Otherwise ask once: **“How would you like to apply this theme?”**

- **Convert the whole app:** update shared components and their usage across screens.
- **Convert selected areas:** establish the pages or components and contain shared changes using the app’s existing mechanisms.
- **Keep the current UI:** install the guidance and instruction pointer, then stop without changing styles or runtime dependencies.

Wait for a missing scope choice before changing application styles. A component request does not authorize whole-app conversion. These rules apply equally to prompt, terminal, and ZIP setup.

## Apply the theme

Use `graphical-convert` for existing UI, including its shadcn mapping when relevant. Use `graphical-ui` for new UI and future interface edits, even when the user does not mention Graphical. New screens use the current design system by default.

Implement the chosen scope in the app’s existing styling system and shared components. Use the theme values, [foundations](gui/foundations.md), and each relevant [component specification](gui/components.md). Preserve authored component edits across parts, variants, sizes, states, modes, and portals. Global tokens alone do not complete conversion; an approximate preset or unchanged library defaults do not replace the supplied specifications.

Preserve content, behavior, routing, public component APIs, and intentional local customizations. After deliberate customization, the app’s active definitions take precedence over this downloaded snapshot. In an imported app, use the active theme in `graphical/project.json`, its theme document under `graphical/themes/`, the role map, and actual source consumers; the guidance is not a competing preset. Preserve dependency versions, ranges, overrides, and lockfiles. Add only missing packages using the project’s package manager and version policy; verify APIs against installed versions and report incompatibilities instead of silently migrating dependencies.

### Set up all Base UI components

An explicit request for all Base UI components, including a recorded selection below, authorizes theme conversion, asset setup, and reusable modules across the existing app. Proceed without another scope question, honoring any narrower scope already supplied.

Integrate the bundled Graphical components and theme runtime; use their actual source rather than reconstructing the library from specifications. Import the bundled stylesheet, connect the theme provider to the supplied document and the app’s active color mode, and expose usable component imports. Reuse or adapt compatible existing shared components without discarding their public APIs or behavior. Use the [component specifications](gui/components.md) to verify the selected edits and [Base UI guidance](gui/base-ui.md) for integration. Check the receiving version’s [official catalog](https://base-ui.com/llms.txt) for additional primitives; use the same foundations where source is not supplied and disclose that coverage gap. Installing source files or dependencies alone does not complete setup until the components and existing app use the selected theme.

The source lives in `components/graphical/`. Import components, `GraphicalProvider`, and `theme` through its `index.ts`; `theme.ts` contains the captured document with the user’s component customizations. Import `components/graphical/styles.css` once at the framework’s supported stylesheet entry. Wrap the intended scope with `GraphicalProvider document={theme} colorMode={colorMode}`, using the app’s real light/dark state. Keep the bundled shared runtime with the components so their resolver, motion, and portal behavior remain connected. Configure the selected icons with `IconRendererProvider` under [Base UI integration](gui/base-ui.md), and fonts with the app’s loader; artwork and font files are not included. Do not silently leave Lucide active when a different free pack was selected.

Add only missing `@base-ui/react`, `motion`, and `lucide-react` packages required by the bundled source, using the receiving project’s package manager and version policy. Preserve its installed framework, React, dependency ranges, overrides, and lockfile decisions. Adapt source to supported APIs or report concrete incompatibilities; do not silently replace package versions. Install the selected fonts and icon pack separately under the asset instructions below. Guidance-only installation adds none of these runtime dependencies.

Before running an install command, check the receiving app’s installed APIs and dependency constraints. The supplied runtime uses React 19 context/provider and ref APIs and is verified against Base UI 1.7; this is a compatibility baseline, not a version-pinning requirement. Existing React 18 apps need compatible context/provider and ref-forwarding adaptations, or a concrete blocker report. Never upgrade existing dependencies automatically to make the source work.

## Rules for UI work

- Locate the active theme, mode, shared components, and nearby patterns first. Use existing tokens or verified aliases; report missing choices instead of inventing theme values. Keep named references at use sites and literals in token definitions. Typography includes family, weight, size, line height, and letter spacing.
- Reuse components and variants, then compose available primitives. New components fill missing capabilities using existing tokens. Consolidate equivalent roles without changing established values unless requested.
- Keep interfaces minimal: build what was requested, with useful titles, content, and actions. Ask whether each element and line of copy should exist before styling or wording it; no unrequested features, decorative eyebrows, filler subtitles, slogans, or redundant explanations. Default wrapping text to `text-wrap: pretty`.
- Trace changes from their owning definition to actual consumers, including inherited text, compiled utilities, responsive conditions, states, modes, and portals. A changed global token does not prove every consumer uses it. Equal values can serve different semantic roles; preserve those distinctions and foreground/background relationships.
- Ordinary simplification of an already adopted UI preserves established values and relationships while reducing duplicate ownership. The explicit `graphical-import` workflow instead fits the app’s values to Graphical’s scales and converts source as its own references specify. Do not use either workflow’s rules to silently change the other’s scope.
- Treat grid tracks, breakpoints, content widths, aspect ratios, and positioning as structural choices. Preserve meaningful data encodings and external widgets in context.
- Preserve keyboard focus, labels, form values, interaction states, and theme propagation into portals. Use composed box shadows for edges with zero native border width, retaining opacity and the theme’s stroke placement.
- Fonts and icon artwork are acquired separately. Follow the selected assets and official links below. Preserve font names, weights, fallback stacks, and icon style/weight. Use licensed files when supplied; ask for missing files or their location before a fallback decision, honoring an existing answer. Use the documented free fallback only for unavailable paid selections, disclose substitutions, and explain how to restore licensed assets. System fonts need no download; report unresolved or gated sources without silently substituting.

## Verify and hand off

Finish a `graphical-convert` implementation with its scoped `graphical-audit` repair pass, finding and fixing gaps within the agreed scope; this does not add an audit to `graphical-import` or `graphical-adopt`. Report each component as converted, already matches, intentionally preserved, or blocked, with evidence or a reason. For full library setup, also list module import paths and catalog coverage. Report actual checks, substitutions, and remaining gaps; source inspection alone does not establish rendered equivalence. Follow the receiving project’s testing and browser-review policy. A small edit does not trigger an app-wide audit. Skill files can be read directly from `.agents/skills/` (or `skills/` in the ZIP) when the agent does not discover them automatically.

## Focused references

| Need                                                   | Read                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Token ownership, aliases, and deliberate theme changes | [Theme contract](gui/theme-contract.md)                                   |
| Hierarchy, composition, navigation, and controls       | [Interface judgment](gui/interface-judgment.md)                           |
| Colors, typography, spacing, effects, and motion       | [Foundations](gui/foundations.md)                                         |
| Asset installation and licensed fallbacks              | [Font and icon setup](gui/assets.md)                                      |
| Component anatomy, assignments, states, and modes      | [Component specifications](gui/components.md)                             |
| Primitives and existing libraries                      | [Base UI](gui/base-ui.md) · [Custom components](gui/custom-components.md) |
| Resolved CSS variables and component assignments       | [Theme references](gui/themes.md)                                         |
| Proportional checks                                    | [Verification](gui/verification.md)                                       |

| Task                                    | Skill               |
| --------------------------------------- | ------------------- |
| Build or edit UI with the current theme | `graphical-ui`      |
| Apply this theme to existing UI         | `graphical-convert` |
| Find and repair theme drift             | `graphical-audit`   |
| Import and convert an existing app with the embedded editor package | `graphical-import`, when supplied |
| Apply editor change batches, switch imported themes, or update the package | `graphical-adopt`, when supplied |
| Preview optional consolidation of an existing app’s style values | `graphical-cleanup` |

`graphical-cleanup` is optional research, separate from installation and conversion. It produces a local before/after analysis page using the app’s existing values; it does not apply cleanup or replace them with this download’s preset values.


## Selected setup for this download

The user selected **Install theme, skills, and all Base UI components**. The actual preview components, shared styling runtime, stylesheet, and current theme snapshot are included in `components/graphical/`. Use these files directly; do not recreate them from specifications. Follow [the component setup guide](gui/base-ui.md): import `components/graphical/styles.css` once, wrap the app with `GraphicalProvider` using the exported `theme`, and use the public components from `components/graphical/index.ts`. Apply the theme across existing app styles and components, preserving behavior and authored refinements. This is an explicit setup request: proceed without another conversion-scope question, honoring any narrower scope already supplied. Add only missing dependencies with the receiving package manager; preserve existing versions and report API incompatibilities. Install the chosen fonts and icons separately. Report component coverage, import paths, actual verification, and any visual or asset gaps. Copying files or installing Base UI alone is not completion.

## Fonts and icons

Follow [asset installation](gui/assets.md) when implementing this theme. Download and configure the selected free assets from their official sources; no font files or icon artwork are bundled. Weights below are the authored requests: load matching static faces or a variable range and report any unavailable weight. Register the exact family aliases below, or map the role tokens to the loader’s actual family.

| Selected font | Roles | Weights | Family stack | Setup |
| --- | --- | --- | --- | --- |
| <code>Inter</code> (free) | display, body, data | 400, 500, 600 | <code>"Sidebar Inter", sans-serif</code> | Download and load [Inter](https://rsms.me/inter/) in the app. |

### Icons

Selected: [Lucide](https://lucide.dev/guide/react/getting-started), outlined. Install and wire the selected free pack (React: <code>lucide-react</code>); reuse it if already installed. Use the official adapter for other frameworks.

Preserve icon size, color, weight, style, and accessible names. Match the selected style only where the pack supports it; Lucide’s official pack supplies outlines, so report a filled-style gap rather than claiming exact filled artwork. Keep existing package versions and add only missing packages using the receiving project’s package manager.

## Theme values

These sections contain the complete saved theme: both color modes, foundation values, and authored component edits. Import this GUI.md from Theme → Edit → Import theme to restore it. Shared palette catalogs and editor preferences are not part of the theme.

Lengths are pixels, letter spacing is em, motion durations are milliseconds, and opacity values are percentages. Text sizes, line heights, spacing, and radii render at the nearest whole pixel; the saved precision below preserves editing values. Color translucency defaults to 20% when omitted. Component edits use named tokens; the companion component specifications resolve inherited styles and behavior.

<!-- graphical-theme:start -->

### Identity

```json
{
  "format": "graphical-theme",
  "version": 1,
  "preset": "forma",
  "schemaVersion": 2,
  "name": "edit.here"
}
```

### Colors

```json
{
  "colors": {
    "light": {
      "neutral-1": "#ffffff",
      "neutral-2": "#fafafa",
      "neutral-3": "#f2f2f3",
      "neutral-4": "#e4e4e7",
      "neutral-5": "#c5c5ca",
      "neutral-6": "#94949c",
      "neutral-7": "#6e6e76",
      "neutral-8": "#505057",
      "neutral-9": "#343438",
      "neutral-10": "#202124",
      "color-1": "#7d43bd",
      "color-2": "#e1cdf3",
      "color-3": "#b8d4c4",
      "color-4": "#e5c7b8",
      "success": "#247348",
      "warning": "#94651e",
      "error": "#bd3d42"
    },
    "dark": {
      "neutral-1": "#171719",
      "neutral-2": "#202023",
      "neutral-3": "#2a2a2e",
      "neutral-4": "#3b3b40",
      "neutral-5": "#55555d",
      "neutral-6": "#80808a",
      "neutral-7": "#ababB4",
      "neutral-8": "#cdCDD3",
      "neutral-9": "#e8e8ed",
      "neutral-10": "#fafafa",
      "color-1": "#d5adff",
      "color-2": "#9974b8",
      "color-3": "#94b8a4",
      "color-4": "#c6a492",
      "success": "#8fd5ad",
      "warning": "#e5c279",
      "error": "#f49fa5"
    }
  },
  "primaryForeground": { "light": "neutral-2", "dark": "neutral-2" },
  "primaryActionColor": "color-1",
  "neutralTone": "neutral",
  "colorEmphasis": 50,
  "keyColorPalette": [
    "#37373d",
    "#285de0",
    "#514bb9",
    "#7d43bd",
    "#ac3c65",
    "#be3d36",
    "#a8521b",
    "#28282c",
    "#85631b",
    "#626d2a",
    "#287345",
    "#247474",
    "#526574"
  ]
}
```

### Typography

```json
{
  "fonts": {
    "body": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": { "regular": 400, "medium": 500, "heavy": 600 }
    },
    "display": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": { "regular": 400, "medium": 500, "heavy": 600 }
    },
    "data": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": { "regular": 400, "medium": 500, "heavy": 600 }
    }
  },
  "text": {
    "xxs": { "size": 10, "lineHeight": 14 },
    "xs": { "size": 12, "lineHeight": 16 },
    "s": { "size": 14, "lineHeight": 20 },
    "m": { "size": 16, "lineHeight": 24 },
    "l": { "size": 24, "lineHeight": 32 },
    "xl": { "size": 36, "lineHeight": 40 },
    "xxl": { "size": 48, "lineHeight": 52 }
  },
  "letterSpacing": { "xs": -0.02, "s": -0.01, "m": 0, "l": 0.01, "xl": 0.02 }
}
```

### Spacing and corners

```json
{
  "spacing": {
    "zero": 0,
    "xxs": 4,
    "xs": 8,
    "s": 12,
    "m": 16,
    "l": 24,
    "xl": 32,
    "xxl": 48
  },
  "radius": { "zero": 0, "xs": 4, "s": 8, "m": 12, "l": 20, "xl": 28, "full": 9999 },
  "buttonRadius": "s"
}
```

### Borders and effects

```json
{
  "border": { "none": 0, "s": 1, "m": 1, "l": 2 },
  "shadows": {
    "s": {
      "x": 0,
      "y": 1,
      "blur": 3,
      "spread": 0,
      "opacity": 12,
      "color": { "light": "neutral-10", "dark": "neutral-1" }
    },
    "m": {
      "x": 0,
      "y": 4,
      "blur": 16,
      "spread": 0,
      "opacity": 10,
      "color": { "light": "neutral-10", "dark": "neutral-1" }
    },
    "l": {
      "x": 0,
      "y": 12,
      "blur": 36,
      "spread": 0,
      "opacity": 14,
      "color": { "light": "neutral-10", "dark": "neutral-1" }
    }
  },
  "surfaceDetails": {
    "edgeColor": "neutral-6-transparent",
    "light": {
      "highlight": 70,
      "shade": 16,
      "gradientTop": 12,
      "gradientBottom": 5,
      "recessedShade": 8
    },
    "dark": {
      "highlight": 24,
      "shade": 24,
      "gradientTop": 10,
      "gradientBottom": 12,
      "recessedShade": 20
    }
  },
  "focusRing": { "color": "color-1", "width": "l", "opacity": 55 }
}
```

### Motion

```json
{
  "animation": {
    "duration": 160,
    "easing": [ 0.16, 1, 0.3, 1 ],
    "large": { "duration": 300, "easing": [ 0.22, 1, 0.36, 1 ] },
    "popupScale": 0.98,
    "pressDistance": 1
  }
}
```

### Icons

No separate icon weight is set; icons follow the surrounding text weight.

```json
{ "iconFamily": "Lucide", "iconStyle": "outlined" }
```

### Other settings

```json
{
  "adjustmentBaseline": {
    "version": 1,
    "textM": 16,
    "text": {
      "xxs": { "size": 10, "lineHeight": 14 },
      "xs": { "size": 12, "lineHeight": 16 },
      "s": { "size": 14, "lineHeight": 20 },
      "m": { "size": 16, "lineHeight": 24 },
      "l": { "size": 24, "lineHeight": 32 },
      "xl": { "size": 36, "lineHeight": 40 },
      "xxl": { "size": 48, "lineHeight": 52 }
    },
    "spacing": {
      "zero": 0,
      "xxs": 4,
      "xs": 8,
      "s": 12,
      "m": 16,
      "l": 24,
      "xl": 32,
      "xxl": 48
    },
    "character": {
      "profile": "forma",
      "radius": { "zero": 0, "xs": 4, "s": 8, "m": 12, "l": 20, "xl": 28, "full": 9999 },
      "border": { "none": 0, "s": 1, "m": 1, "l": 2 },
      "weights": {
        "body": { "regular": 400, "medium": 500, "heavy": 600 },
        "display": { "regular": 400, "medium": 500, "heavy": 600 },
        "data": { "regular": 400, "medium": 500, "heavy": 600 }
      },
      "colorEmphasis": 50,
      "buttonRadius": "s"
    }
  }
}
```

### Component edits

```json
{
  "componentTokens": {
    "button:primary:rest": { "borderColor": "neutral-6-transparent", "shadow": "s" },
    "button:primary:hover": { "borderColor": "neutral-7-transparent", "shadow": "s" },
    "button:primary:focus": { "borderColor": "neutral-7-transparent", "shadow": "s" },
    "button:secondary:rest": {
      "background": "neutral-1",
      "borderColor": "neutral-6-transparent",
      "shadow": "s"
    },
    "button:secondary:hover": {
      "background": "neutral-2",
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:secondary:focus": {
      "background": "neutral-2",
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:outline:rest": { "borderColor": "neutral-6-transparent" }
  },
  "componentVariants": {}
}
```

<!-- graphical-theme:end -->
