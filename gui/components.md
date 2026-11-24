# Component specifications

Each theme below includes a focused specification for every component in Graphical's preview catalog. Specifications combine the preview's resolved values with anatomy, geometry, state, and composition rules. Authored refinements are part of the target, not optional suggestions. Read the relevant files when building individual components; read every entry when setting up the full library.

Both setup choices include all specifications. When the full library is selected, components/graphical/ also contains the actual preview components, their shared styling runtime, styles.css, and the current theme.ts snapshot. Use that implementation directly and follow the component setup in base-ui.md; specifications explain and verify it, not replace it. The theme-and-skills choice includes no component source or component dependency installation; build or style components as needed. Follow the selected setup in GUI.md when present.

For a full installation, track every component below as implemented, reused and verified, or blocked with a concrete reason, and provide its import path. Also check the receiving version's [official Base UI catalog](https://base-ui.com/llms.txt) for supported additions; disclose components without a Graphical preview specification instead of claiming a verified visual match. Utility providers and hooks are integration tools, not standalone visual components.

Preserve the supplied assets and resolved styles. Free fallbacks can change appearance and must be disclosed. Honor the receiving app's dependency and review policies; only claim visual parity for what was actually verified.

## edit.here

[Theme foundations](themes/edit-here.md) · [Effective assignment tables](themes/edit-here-components.md)

- [Accordion](components/edit-here/accordion.md)
- [Alert dialog](components/edit-here/alert-dialog.md)
- [Autocomplete](components/edit-here/autocomplete.md)
- [Avatar](components/edit-here/avatar.md)
- [Button](components/edit-here/button.md)
- [Checkbox](components/edit-here/checkbox.md)
- [Checkbox group](components/edit-here/checkbox-group.md)
- [Collapsible](components/edit-here/collapsible.md)
- [Combobox](components/edit-here/combobox.md)
- [Context menu](components/edit-here/context-menu.md)
- [Dialog](components/edit-here/dialog.md)
- [Drawer](components/edit-here/drawer.md)
- [Field](components/edit-here/field.md)
- [Fieldset](components/edit-here/fieldset.md)
- [Form](components/edit-here/form.md)
- [Menu](components/edit-here/menu.md)
- [Menubar](components/edit-here/menubar.md)
- [Meter](components/edit-here/meter.md)
- [Navigation menu](components/edit-here/navigation-menu.md)
- [Number field](components/edit-here/number-field.md)
- [OTP field](components/edit-here/otp-field.md)
- [Popover](components/edit-here/popover.md)
- [Preview card](components/edit-here/preview-card.md)
- [Progress](components/edit-here/progress.md)
- [Radio](components/edit-here/radio.md)
- [Radio group](components/edit-here/radio-group.md)
- [Scroll area](components/edit-here/scroll-area.md)
- [Select](components/edit-here/select.md)
- [Separator](components/edit-here/separator.md)
- [Slider](components/edit-here/slider.md)
- [Switch](components/edit-here/switch.md)
- [Tabs](components/edit-here/tabs.md)
- [Text field](components/edit-here/input.md)
- [Toast](components/edit-here/toast.md)
- [Toggle](components/edit-here/toggle.md)
- [Toggle group](components/edit-here/toggle-group.md)
- [Toolbar](components/edit-here/toolbar.md)
- [Tooltip](components/edit-here/tooltip.md)
