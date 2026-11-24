# Foundation vocabulary

These are the shared names and usage rules, not a fixed type scale or color ramp. Read the active theme and its generated [snapshot reference](themes.md) for actual values in each mode. Preserve fractional dimensions, authored weights, and the chosen theme’s character. Do not round it into a generic scale or copy a different preset’s treatments.

## Colors

The color groups are Palette, Neutrals, Status, and None. Palette supports `color-1` through `color-10`; not every theme defines all ten. Read the theme reference before referencing optional colors. Neutrals are `neutral-1` through `neutral-10`; status colors are `success`, `warning`, and `error`. `none` resolves to transparent.

Every real color has three levels: solid, `-translucent` and `-transparent`. The two translucent levels use the solid token's channels/color space at **40% and 20% opacity by default** in both modes. Authored `theme.colorTranslucent[mode][baseColorKey]` and `theme.colorTranslucency[mode][baseColorKey]` percentages (0–100) override those defaults for the selected color and mode; both channels and opacity resolve live. Neither is a separately tuned muted color, and neither is composited into Neutral 1 ahead of time. Preserve the alpha when layering surfaces. Do not fade an entire component to simulate a transparent border.

Use the chosen theme's values and contrast roles. Neutral ordering follows the theme/mode; do not assume Neutral 1 always means white. Primary foreground may be authored per mode; use the effective component assignments instead of hardcoding white text on accent colors. Explicit foreground assignments remain meaningful choices.

CSS names are `--color-1`, `--color-1-translucent`, `--color-1-transparent`, `--neutral-4`, `--neutral-4-transparent`, `--success`, `--error-translucent`, etc. None is `--color-none`. The reference also includes resolved convenience roles such as `--cte-canvas`, `--cte-surface`, `--cte-text`, `--cte-text-muted`, and `--cte-accent`. Define these in the app’s theme scope using the generated tables.

## Typography

Font roles: `body` (all interface and reading text), `display` (headings and hero text) and `data` (numbers, code and tables). Each role has a font-family string and weights `regular`, `medium`, `heavy`. There are two type scales with the same seven steps, `xxs` to `xxl`: body sets body and data text, display sets display text, so the font role picks the scale. Each step has a font size and line height. A theme without its own display scale uses the body scale's values. Letter spacing is an independent five-value scale: `xs`, `s`, `m`, `l`, `xl`, exposed as `--tracking-*`. Read `theme.letterSpacing` for its values in em; the editor shows percentages (1% = 0.01em). Defaults are −2%, −1%, 0%, +1%, +2%, independently customizable per theme.

```css
.screen-title {
  font-family: var(--font-display);
  font-size: var(--display-size-l);
  line-height: var(--display-line-l);
  letter-spacing: var(--display-letter-spacing-l);
  font-weight: var(--weight-display-heavy);
}
.row-label {
  font-family: var(--font-body);
  font-size: var(--size-s);
  line-height: var(--line-s);
  letter-spacing: var(--letter-spacing-s);
  font-weight: var(--weight-body-medium);
}
```

A text style is a role's step, such as Body S or Display L: apply its size, line height and tracking together. Body uses `--size-*`, `--line-*` and `--letter-spacing-*`; display uses `--display-size-*`, `--display-line-*` and `--display-letter-spacing-*`. The step's tracking alias chooses the default: XXS → XL, XS/S → L, M → M, L/XL → S, XXL → XS, tightening large text and slightly opening small text. A display step takes the tracking of the body step nearest its size. An explicit component `letterSpacing` choice overrides the step's default with `var(--tracking-<key>)` and stays linked to the theme. Font-family changes preserve this scale. Do not select a size and invent a different line height. Typography composes: the font role picks the face, the text style picks the size, line height and tracking, and the weight is relative to the role, so medium is medium in whichever face the text uses. With Graphical's utility classes, those are `font-body`, `text-display-l` and `font-medium`. A body font at a display size can be intentional. Use data typography for tabular content when appropriate. All theme-controlled styling in application markup must retain named token references, including font roles and weights, text styles, spacing, colors and their translucent and transparent levels, corners, border widths, shadows, and motion. Never copy computed values such as `41.98px` or `15.29px` into source when they represent `--size-xxl` or `--space-m`; those values change with the theme. Structural layout constraints remain application decisions. Use the application theme variables throughout custom components.

The paired text style is the default. An explicit component `lineHeight` choice selects any existing `var(--line-<key>)` independently and remains selected when text size changes; omission follows `textSize`. When the app or an accepted editor edit uses a different existing `--line-*` or `--display-line-*` token, preserve that named reference and its source ownership. Do not replace it with a computed pixel value.

Default to `text-wrap: pretty` for almost all wrapping interface text: headings, paragraphs, descriptions, cards, empty states, and wrapping labels. Set it in the shared app typography scope so it is inherited, including in portalled UI, rather than adding it only where an orphan was noticed. Preserve deliberate single-line/truncated controls, preformatted code, and editing behavior where stable line breaks matter. Do not use manual `<br>` tags to fix one viewport. Pretty wrapping improves line-break selection but does not guarantee that every orphan disappears; keep copy concise and review widths under the project’s review policy. See the [CSS wrapping reference](https://drafts.csswg.org/css-text-4/#text-wrap-style).

Font files are not bundled. Follow [Font and icon setup](assets.md) for acquisition, licensed-font file requests, and fallback decisions. Preserve authored family roles, weights, and stacks when configuring fonts.

## Spacing and sizing

Spacing keys: `zero`, `xxs`, `xs`, `s`, `m`, `l`, `xl`, `xxl`, exposed as `--space-*`. Use them for padding, gaps, margins, and layout rhythms. Their values vary by theme; a key is not a globally fixed number of pixels.

Controls generally size from content plus padding. Checkbox/switch and other explicit control geometry use their `controlSize` token assignments. Border width does not contribute to layout or thumb geometry. Authored component assignments may use a local numeric `borderWidth` in pixels instead of a named width; keep it local and still draw the edge with a shadow. Optional `backgroundOpacity` and `opacity` values are percentages (0–100), while `backdropBlur` is pixels (0–100). Omitted opacities are 100 and omitted blurs are 0. Multiply fill opacity by the color’s existing alpha without fading text or borders; layer opacity includes children. Use `backdrop-filter` (plus its WebKit counterpart) for background blur; do not offer layer blur as a customization control. Zero blur resolves to `none`, not `blur(0px)`, and lifecycle opacity must still hide exiting popups. Keep modal backdrops separate from their popups. Responsive max widths and grid structure can be application layout decisions; theme-dependent internal spacing should stay token based.

## Radius, borders, shadows, and surfaces

Radius: `zero`, `xs`, `s`, `m`, `l`, `xl`, `full`, with `--radius-*`. Corner overrides exist for parts that support them. Border widths: `none`, `s`, `m`, `l`, with `--border-*`. Where an import installed Graphical's utility classes, corners are `corner-*` and border widths `edge-*`, with sides such as `corner-t-m` and `edge-b-s`; Tailwind's `rounded-*` and `border-*` keep their own meaning, and border colors stay `border-*`. Elevation: `none`, `s`, `m`, `l`, with `--shadow-*`. Shadow data includes geometry, opacity, and mode-dependent color references. Optional `type` (`realistic` or `box`) and `position` (`outside` or `inside`) default to realistic outside shadows. Realistic combines contact and ambient layers at the authored strength; Box uses a single layer. Resolve the complete value through `--shadow-*`, including inset layers when selected, rather than reconstructing a shadow from its geometry.

Visible component edges use box shadows, not CSS border strokes. Set native border width to zero. For a simple custom surface:

```css
.summary-card {
  border: 0;
  border-radius: var(--radius-m);
  padding: var(--space-l);
  background: var(--neutral-1);
  box-shadow: var(--border-shadow-s), var(--shadow-s);
}
```

Use the theme’s effective component assignments and appearance values for surface treatments in each mode and state. Apply the supplied border placement and color, including its opacity. Compose edges with all authored outer and inner shadows, focus, and any separate bevel treatment. Shadow stacks are ordered; each layer is a named shadow reference or a local definition with position, offsets, blur, spread, opacity, and color. An authored stack replaces the single legacy shadow choice, and an empty stack removes all shadows. Preserve inner highlights marked clipToBorder on an inset overlay so they do not wash out a translucent edge. Do not replace the complete shadow just to add one edge. Dividers use a one-sided inset shadow. SVG artwork strokes and keyboard focus outlines are separate from component borders.

Solid, translucent and transparent border tokens are all valid. Do not automatically turn `neutral-4` into `neutral-4-transparent`. Apply shared surface treatments in the app’s reusable component styles, using the supplied mode/state assignments.

## Icons

Theme icon family, style, and weight are authored choices. Follow [Font and icon setup](assets.md) to install the selected free pack or the named free fallback when licensed artwork is unavailable. Configure the app’s icon implementation with the theme’s intended treatment and report unsupported styles. Decorative icons should be hidden from assistive technology, and icon-only actions need an accessible name. Preserve the instance’s size, color, and accessibility bindings when changing its glyph.

## Motion and focus

Small motion uses `--motion-duration` and `--motion-easing`; Large uses the existing `--motion-large-duration` and `--motion-large-easing` variables and `animation.large` data. Popup scale and press distance are separate variables. Zero-duration curves are immediate: remove decorative anticipation and stop loading/progress loops instead of running infinite animations at zero duration. Derive any choreography delays from the selected role. Controls, menus, and small popovers use the small curve; dialogs, drawers, toast, navigation surfaces, and disclosure panels use the Large curve. Preserve each component's implementation rather than applying one generic transition to every element.

For authored React animation, use Motion for React (`motion/react`) with the theme’s motion values when the app supports it. Easing uses a tween with duration in seconds and the authored Bézier; springs use `visualDuration` in seconds and `bounce`. Theme easing duration is recorded in milliseconds. Avoid stiffness/damping/mass when preserving visual duration. Keep the receiving app’s dependency policy.

The reference includes resolved CSS duration/easing variables, including the spring’s settling tail, alongside the authored spring values. Use these for CSS-based primitives; keep mode and theme changes live. Preserve the primitive’s mounting and animation lifecycle, transition only the intended properties, and honor reduced motion. See [Base UI](base-ui.md) or [Custom components](custom-components.md) for integration guidance.

Keep real keyboard focus indicators even when adding selected, checked, hover, or pressed styles. Disabled, read-only, invalid, loading, and complete are distinct states, not interchangeable opacity treatments.
