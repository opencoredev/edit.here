# edit.here

Generated from the current project, including edits awaiting autosave. Return to the [theme index](../themes.md). Install the selected fonts and icons using the setup below; assets are acquired separately from their official sources.

## Font and icon setup

Follow [asset installation](../assets.md) when implementing this theme. Download and configure the selected free assets from their official sources; no font files or icon artwork are bundled. Weights below are the authored requests: load matching static faces or a variable range and report any unavailable weight. Register the exact family aliases below, or map the role tokens to the loader’s actual family.

| Selected font | Roles | Weights | Family stack | Setup |
| --- | --- | --- | --- | --- |
| <code>Inter</code> (free) | display, body, data | 400, 500, 600 | <code>"Sidebar Inter", sans-serif</code> | Download and load [Inter](https://rsms.me/inter/) in the app. |

### Icons

Selected: [Lucide](https://lucide.dev/guide/react/getting-started), outlined. Install and wire the selected free pack (React: <code>lucide-react</code>); reuse it if already installed. Use the official adapter for other frameworks.

Preserve icon size, color, weight, style, and accessible names. Match the selected style only where the pack supports it; Lucide’s official pack supplies outlines, so report a filled-style gap rather than claiming exact filled artwork. Keep existing package versions and add only missing packages using the receiving project’s package manager.

## Foundations

These foundations describe the captured theme resolved by the bundled GraphicalProvider. The name below is document.theme.name, an internal style identity used by the components; displayName is the project’s visible name. Preserve it and the provider’s resolved --theme-name even when they differ from each other or from the project’s display name. Use document.name for visible labels.

```json
{
  "name": "Forma",
  "primaryForeground": {
    "light": "neutral-2",
    "dark": "neutral-2"
  },
  "neutralTone": "neutral",
  "colorEmphasis": 50,
  "iconFamily": "Lucide",
  "iconStyle": "outlined",
  "buttonRadius": "s",
  "primaryActionColor": "color-1",
  "fonts": {
    "body": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 600
      }
    },
    "display": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 600
      }
    },
    "data": {
      "family": "\"Sidebar Inter\", sans-serif",
      "weights": {
        "regular": 400,
        "medium": 500,
        "heavy": 600
      }
    }
  },
  "text": {
    "xxs": {
      "size": 10,
      "lineHeight": 14
    },
    "xs": {
      "size": 12,
      "lineHeight": 16
    },
    "s": {
      "size": 14,
      "lineHeight": 20
    },
    "m": {
      "size": 16,
      "lineHeight": 24
    },
    "l": {
      "size": 24,
      "lineHeight": 32
    },
    "xl": {
      "size": 36,
      "lineHeight": 40
    },
    "xxl": {
      "size": 48,
      "lineHeight": 52
    }
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
  "radius": {
    "zero": 0,
    "xs": 4,
    "s": 8,
    "m": 12,
    "l": 20,
    "xl": 28,
    "full": 9999
  },
  "border": {
    "none": 0,
    "s": 1,
    "m": 1,
    "l": 2
  },
  "shadows": {
    "s": {
      "x": 0,
      "y": 1,
      "blur": 3,
      "spread": 0,
      "opacity": 12,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
    },
    "m": {
      "x": 0,
      "y": 4,
      "blur": 16,
      "spread": 0,
      "opacity": 10,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
    },
    "l": {
      "x": 0,
      "y": 12,
      "blur": 36,
      "spread": 0,
      "opacity": 14,
      "color": {
        "light": "neutral-10",
        "dark": "neutral-1"
      }
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
  "focusRing": {
    "color": "color-1",
    "width": "l",
    "opacity": 55
  },
  "animation": {
    "duration": 160,
    "easing": [
      0.16,
      1,
      0.3,
      1
    ],
    "large": {
      "duration": 300,
      "easing": [
        0.22,
        1,
        0.36,
        1
      ]
    },
    "popupScale": 0.98,
    "pressDistance": 1
  },
  "adjustmentBaseline": {
    "version": 1,
    "textM": 16,
    "text": {
      "xxs": {
        "size": 10,
        "lineHeight": 14
      },
      "xs": {
        "size": 12,
        "lineHeight": 16
      },
      "s": {
        "size": 14,
        "lineHeight": 20
      },
      "m": {
        "size": 16,
        "lineHeight": 24
      },
      "l": {
        "size": 24,
        "lineHeight": 32
      },
      "xl": {
        "size": 36,
        "lineHeight": 40
      },
      "xxl": {
        "size": 48,
        "lineHeight": 52
      }
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
      "radius": {
        "zero": 0,
        "xs": 4,
        "s": 8,
        "m": 12,
        "l": 20,
        "xl": 28,
        "full": 9999
      },
      "border": {
        "none": 0,
        "s": 1,
        "m": 1,
        "l": 2
      },
      "weights": {
        "body": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        },
        "display": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        },
        "data": {
          "regular": 400,
          "medium": 500,
          "heavy": 600
        }
      },
      "colorEmphasis": 50,
      "buttonRadius": "s"
    }
  },
  "letterSpacing": {
    "xs": -0.02,
    "s": -0.01,
    "m": 0,
    "l": 0.01,
    "xl": 0.02
  },
  "displayName": "edit.here"
}
```

## light CSS variables

GraphicalProvider already defines these variables for this mode and carries them into portalled components. Use this table to verify the integration. Preserve its internal --theme-name value; do not rename it to match the project title. Keep application styles linked to these variables.

| Variable | Value |
| --- | --- |
| `--theme-name` | Alloy |
| `--theme-icon-family` | Lucide |
| `--theme-icon-style` | outlined |
| `--theme-hugeicons-variant` | stroke-standard |
| `--theme-icon-weight` | initial |
| `--theme-icon-stroke-width` | initial |
| `--theme-icon-thin-display` | initial |
| `--theme-icon-light-display` | initial |
| `--theme-icon-regular-display` | initial |
| `--theme-icon-bold-display` | initial |
| `--toolbar-divider-bleed` | 0 |
| `--focus-ring-outline` | 2px solid color-mix(in srgb, #7d43bd 55%, transparent) |
| `--icon-stroke-width` | var(--theme-icon-stroke-width, 2) |
| `--icon-light-display` | var(--theme-icon-light-display, none) |
| `--icon-regular-display` | var(--theme-icon-regular-display, inline) |
| `--icon-bold-display` | var(--theme-icon-bold-display, none) |
| `--motion-duration` | 160ms |
| `--motion-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-type` | easing |
| `--motion-visual-duration` | 0.16 |
| `--motion-bounce` | 0.2 |
| `--motion-enabled` | 1 |
| `--motion-small-iterations` | infinite |
| `--motion-large-duration` | 300ms |
| `--motion-large-easing` | cubic-bezier(0.22, 1, 0.36, 1) |
| `--motion-large-type` | easing |
| `--motion-large-visual-duration` | 0.3 |
| `--motion-large-bounce` | 0.2 |
| `--motion-large-iterations` | infinite |
| `--motion-popup-scale` | 0.98 |
| `--motion-press-distance` | 1px |
| `--option-badge-background` | color-mix(in srgb, var(--color-1) 10%, transparent) |
| `--option-badge-foreground` | #7d43bd |
| `--navigation-active-foreground` | #202124 |
| `--emphasis-chart-fill` | #7d43bd33 |
| `--emphasis-balance-background` | #f2f2f3 |
| `--emphasis-rewards-background` | #f2f2f3 |
| `--emphasis-icon-background` | #f2f2f3 |
| `--emphasis-icon-foreground` | #202124 |
| `--emphasis-type-background` | #f2f2f3 |
| `--emphasis-type-foreground` | #202124 |
| `--navigation-active-background` | #7d43bd33 |
| `--surface-raised-image` | linear-gradient(180deg, #ffffff1f 0%, #ffffff00 48%, #2021240d 100%) |
| `--surface-raised-shadow` | inset 0px 1px 0px 0px #ffffffb3, inset 0px -1px 0px 0px #20212429 |
| `--surface-recessed-image` | linear-gradient(180deg, #2021240d 0%, #20212400 55%) |
| `--surface-recessed-shadow` | inset 0px 1px 2px 0px #20212414, inset 0px -1px 0px 0px #ffffff59 |
| `--space-zero` | 0px |
| `--space-xxs` | 4px |
| `--space-xs` | 8px |
| `--space-s` | 12px |
| `--space-m` | 16px |
| `--space-l` | 24px |
| `--space-xl` | 32px |
| `--space-xxl` | 48px |
| `--tracking-xs` | -0.02em |
| `--tracking-s` | -0.01em |
| `--tracking-m` | 0em |
| `--tracking-l` | 0.01em |
| `--tracking-xl` | 0.02em |
| `--size-xxs` | 10px |
| `--line-xxs` | 14px |
| `--letter-spacing-xxs` | 0.02em |
| `--display-size-xxs` | 10px |
| `--display-line-xxs` | 14px |
| `--display-letter-spacing-xxs` | 0.02em |
| `--size-xs` | 12px |
| `--line-xs` | 16px |
| `--letter-spacing-xs` | 0.01em |
| `--display-size-xs` | 12px |
| `--display-line-xs` | 16px |
| `--display-letter-spacing-xs` | 0.01em |
| `--size-s` | 14px |
| `--line-s` | 20px |
| `--letter-spacing-s` | 0.01em |
| `--display-size-s` | 14px |
| `--display-line-s` | 20px |
| `--display-letter-spacing-s` | 0.01em |
| `--size-m` | 16px |
| `--line-m` | 24px |
| `--letter-spacing-m` | 0em |
| `--display-size-m` | 16px |
| `--display-line-m` | 24px |
| `--display-letter-spacing-m` | 0em |
| `--size-l` | 24px |
| `--line-l` | 32px |
| `--letter-spacing-l` | -0.01em |
| `--display-size-l` | 24px |
| `--display-line-l` | 32px |
| `--display-letter-spacing-l` | -0.01em |
| `--size-xl` | 36px |
| `--line-xl` | 40px |
| `--letter-spacing-xl` | -0.01em |
| `--display-size-xl` | 36px |
| `--display-line-xl` | 40px |
| `--display-letter-spacing-xl` | -0.01em |
| `--size-xxl` | 48px |
| `--line-xxl` | 52px |
| `--letter-spacing-xxl` | -0.02em |
| `--display-size-xxl` | 48px |
| `--display-line-xxl` | 52px |
| `--display-letter-spacing-xxl` | -0.02em |
| `--radius-zero` | 0px |
| `--radius-xs` | 4px |
| `--radius-s` | 8px |
| `--radius-m` | 12px |
| `--radius-l` | 20px |
| `--radius-xl` | 28px |
| `--radius-full` | 9999px |
| `--border-none` | 0px |
| `--border-s` | 1px |
| `--border-m` | 1px |
| `--border-l` | 2px |
| `--border-default-color` | #94949c33 |
| `--border-shadow-none` | 0 0 0 0 transparent |
| `--border-shadow-s` | 0 0 0 1px #94949c33 |
| `--border-shadow-m` | 0 0 0 1px #94949c33 |
| `--border-shadow-l` | 0 0 0 2px #94949c33 |
| `--font-body` | "Sidebar Inter", sans-serif |
| `--weight-body-regular` | 400 |
| `--weight-body-medium` | 500 |
| `--weight-body-heavy` | 600 |
| `--font-display` | "Sidebar Inter", sans-serif |
| `--weight-display-regular` | 400 |
| `--weight-display-medium` | 500 |
| `--weight-display-heavy` | 600 |
| `--font-data` | "Sidebar Inter", sans-serif |
| `--weight-data-regular` | 400 |
| `--weight-data-medium` | 500 |
| `--weight-data-heavy` | 600 |
| `--color-none` | transparent |
| `--color-1` | #7d43bd |
| `--color-1-translucent` | #7d43bd66 |
| `--color-1-transparent` | #7d43bd33 |
| `--color-2` | #e1cdf3 |
| `--color-2-translucent` | #e1cdf366 |
| `--color-2-transparent` | #e1cdf333 |
| `--color-3` | #b8d4c4 |
| `--color-3-translucent` | #b8d4c466 |
| `--color-3-transparent` | #b8d4c433 |
| `--color-4` | #e5c7b8 |
| `--color-4-translucent` | #e5c7b866 |
| `--color-4-transparent` | #e5c7b833 |
| `--neutral-1` | #ffffff |
| `--neutral-1-translucent` | #ffffff66 |
| `--neutral-1-transparent` | #ffffff33 |
| `--neutral-2` | #fafafa |
| `--neutral-2-translucent` | #fafafa66 |
| `--neutral-2-transparent` | #fafafa33 |
| `--neutral-3` | #f2f2f3 |
| `--neutral-3-translucent` | #f2f2f366 |
| `--neutral-3-transparent` | #f2f2f333 |
| `--neutral-4` | #e4e4e7 |
| `--neutral-4-translucent` | #e4e4e766 |
| `--neutral-4-transparent` | #e4e4e733 |
| `--neutral-5` | #c5c5ca |
| `--neutral-5-translucent` | #c5c5ca66 |
| `--neutral-5-transparent` | #c5c5ca33 |
| `--neutral-6` | #94949c |
| `--neutral-6-translucent` | #94949c66 |
| `--neutral-6-transparent` | #94949c33 |
| `--neutral-7` | #6e6e76 |
| `--neutral-7-translucent` | #6e6e7666 |
| `--neutral-7-transparent` | #6e6e7633 |
| `--neutral-8` | #505057 |
| `--neutral-8-translucent` | #50505766 |
| `--neutral-8-transparent` | #50505733 |
| `--neutral-9` | #343438 |
| `--neutral-9-translucent` | #34343866 |
| `--neutral-9-transparent` | #34343833 |
| `--neutral-10` | #202124 |
| `--neutral-10-translucent` | #20212466 |
| `--neutral-10-transparent` | #20212433 |
| `--success` | #247348 |
| `--success-translucent` | #24734866 |
| `--success-transparent` | #24734833 |
| `--warning` | #94651e |
| `--warning-translucent` | #94651e66 |
| `--warning-transparent` | #94651e33 |
| `--error` | #bd3d42 |
| `--error-translucent` | #bd3d4266 |
| `--error-transparent` | #bd3d4233 |
| `--on-color-1` | #fafafa |
| `--on-color-2` | #000000 |
| `--on-color-3` | #000000 |
| `--on-color-4` | #000000 |
| `--on-success` | #ffffff |
| `--on-warning` | #ffffff |
| `--on-error` | #ffffff |
| `--on-neutral-1` | #202124 |
| `--on-neutral-2` | #202124 |
| `--on-neutral-3` | #202124 |
| `--on-neutral-4` | #202124 |
| `--on-neutral-5` | #202124 |
| `--on-neutral-6` | #202124 |
| `--on-neutral-7` | #ffffff |
| `--on-neutral-8` | #ffffff |
| `--on-neutral-9` | #ffffff |
| `--on-neutral-10` | #ffffff |
| `--shadow-none` | none |
| `--shadow-s` | 0px 0.25px 0.75px 0px #2021240d, 0px 1px 3px 0px #20212413 |
| `--shadow-m` | 0px 1px 4px 0px #2021240b, 0px 4px 16px 0px #20212410 |
| `--shadow-l` | 0px 3px 9px 0px #2021240f, 0px 12px 36px 0px #20212416 |
| `--cte-canvas` | #ffffff |
| `--cte-surface` | #fafafa |
| `--cte-surface-muted` | #f2f2f3 |
| `--cte-text` | #202124 |
| `--cte-text-muted` | #6e6e76 |
| `--cte-border` | #94949c33 |
| `--cte-accent` | #7d43bd |
| `--cte-accent-text` | #fafafa |
| `--cte-danger` | #bd3d42 |
| `--cte-focus` | #7d43bd |
| `--cte-font` | "Sidebar Inter", sans-serif |
| `--cte-font-size` | 14px |
| `--cte-font-weight` | 400 |
| `--cte-line-height` | 20px |
| `--cte-letter-spacing` | 0.01em |
| `--cte-detail-font-size` | 12px |
| `--cte-detail-line-height` | 16px |
| `--cte-detail-letter-spacing` | 0.01em |

## dark CSS variables

GraphicalProvider already defines these variables for this mode and carries them into portalled components. Use this table to verify the integration. Preserve its internal --theme-name value; do not rename it to match the project title. Keep application styles linked to these variables.

| Variable | Value |
| --- | --- |
| `--theme-name` | Alloy |
| `--theme-icon-family` | Lucide |
| `--theme-icon-style` | outlined |
| `--theme-hugeicons-variant` | stroke-standard |
| `--theme-icon-weight` | initial |
| `--theme-icon-stroke-width` | initial |
| `--theme-icon-thin-display` | initial |
| `--theme-icon-light-display` | initial |
| `--theme-icon-regular-display` | initial |
| `--theme-icon-bold-display` | initial |
| `--toolbar-divider-bleed` | 0 |
| `--focus-ring-outline` | 2px solid color-mix(in srgb, #d5adff 55%, transparent) |
| `--icon-stroke-width` | var(--theme-icon-stroke-width, 2) |
| `--icon-light-display` | var(--theme-icon-light-display, none) |
| `--icon-regular-display` | var(--theme-icon-regular-display, inline) |
| `--icon-bold-display` | var(--theme-icon-bold-display, none) |
| `--motion-duration` | 160ms |
| `--motion-easing` | cubic-bezier(0.16, 1, 0.3, 1) |
| `--motion-type` | easing |
| `--motion-visual-duration` | 0.16 |
| `--motion-bounce` | 0.2 |
| `--motion-enabled` | 1 |
| `--motion-small-iterations` | infinite |
| `--motion-large-duration` | 300ms |
| `--motion-large-easing` | cubic-bezier(0.22, 1, 0.36, 1) |
| `--motion-large-type` | easing |
| `--motion-large-visual-duration` | 0.3 |
| `--motion-large-bounce` | 0.2 |
| `--motion-large-iterations` | infinite |
| `--motion-popup-scale` | 0.98 |
| `--motion-press-distance` | 1px |
| `--option-badge-background` | color-mix(in srgb, var(--color-1) 10%, transparent) |
| `--option-badge-foreground` | #d5adff |
| `--navigation-active-foreground` | #fafafa |
| `--emphasis-chart-fill` | #d5adff33 |
| `--emphasis-balance-background` | #2a2a2e |
| `--emphasis-rewards-background` | #2a2a2e |
| `--emphasis-icon-background` | #2a2a2e |
| `--emphasis-icon-foreground` | #fafafa |
| `--emphasis-type-background` | #2a2a2e |
| `--emphasis-type-foreground` | #fafafa |
| `--navigation-active-background` | #d5adff33 |
| `--surface-raised-image` | linear-gradient(180deg, #fafafa1a 0%, #fafafa00 48%, #1717191f 100%) |
| `--surface-raised-shadow` | inset 0px 1px 0px 0px #fafafa3d, inset 0px -1px 0px 0px #1717193d |
| `--surface-recessed-image` | linear-gradient(180deg, #1717191f 0%, #17171900 55%) |
| `--surface-recessed-shadow` | inset 0px 1px 2px 0px #17171933, inset 0px -1px 0px 0px #fafafa1f |
| `--space-zero` | 0px |
| `--space-xxs` | 4px |
| `--space-xs` | 8px |
| `--space-s` | 12px |
| `--space-m` | 16px |
| `--space-l` | 24px |
| `--space-xl` | 32px |
| `--space-xxl` | 48px |
| `--tracking-xs` | -0.02em |
| `--tracking-s` | -0.01em |
| `--tracking-m` | 0em |
| `--tracking-l` | 0.01em |
| `--tracking-xl` | 0.02em |
| `--size-xxs` | 10px |
| `--line-xxs` | 14px |
| `--letter-spacing-xxs` | 0.02em |
| `--display-size-xxs` | 10px |
| `--display-line-xxs` | 14px |
| `--display-letter-spacing-xxs` | 0.02em |
| `--size-xs` | 12px |
| `--line-xs` | 16px |
| `--letter-spacing-xs` | 0.01em |
| `--display-size-xs` | 12px |
| `--display-line-xs` | 16px |
| `--display-letter-spacing-xs` | 0.01em |
| `--size-s` | 14px |
| `--line-s` | 20px |
| `--letter-spacing-s` | 0.01em |
| `--display-size-s` | 14px |
| `--display-line-s` | 20px |
| `--display-letter-spacing-s` | 0.01em |
| `--size-m` | 16px |
| `--line-m` | 24px |
| `--letter-spacing-m` | 0em |
| `--display-size-m` | 16px |
| `--display-line-m` | 24px |
| `--display-letter-spacing-m` | 0em |
| `--size-l` | 24px |
| `--line-l` | 32px |
| `--letter-spacing-l` | -0.01em |
| `--display-size-l` | 24px |
| `--display-line-l` | 32px |
| `--display-letter-spacing-l` | -0.01em |
| `--size-xl` | 36px |
| `--line-xl` | 40px |
| `--letter-spacing-xl` | -0.01em |
| `--display-size-xl` | 36px |
| `--display-line-xl` | 40px |
| `--display-letter-spacing-xl` | -0.01em |
| `--size-xxl` | 48px |
| `--line-xxl` | 52px |
| `--letter-spacing-xxl` | -0.02em |
| `--display-size-xxl` | 48px |
| `--display-line-xxl` | 52px |
| `--display-letter-spacing-xxl` | -0.02em |
| `--radius-zero` | 0px |
| `--radius-xs` | 4px |
| `--radius-s` | 8px |
| `--radius-m` | 12px |
| `--radius-l` | 20px |
| `--radius-xl` | 28px |
| `--radius-full` | 9999px |
| `--border-none` | 0px |
| `--border-s` | 1px |
| `--border-m` | 1px |
| `--border-l` | 2px |
| `--border-default-color` | #80808a33 |
| `--border-shadow-none` | 0 0 0 0 transparent |
| `--border-shadow-s` | inset 0 0 0 1px #80808a33 |
| `--border-shadow-m` | inset 0 0 0 1px #80808a33 |
| `--border-shadow-l` | inset 0 0 0 2px #80808a33 |
| `--font-body` | "Sidebar Inter", sans-serif |
| `--weight-body-regular` | 400 |
| `--weight-body-medium` | 500 |
| `--weight-body-heavy` | 600 |
| `--font-display` | "Sidebar Inter", sans-serif |
| `--weight-display-regular` | 400 |
| `--weight-display-medium` | 500 |
| `--weight-display-heavy` | 600 |
| `--font-data` | "Sidebar Inter", sans-serif |
| `--weight-data-regular` | 400 |
| `--weight-data-medium` | 500 |
| `--weight-data-heavy` | 600 |
| `--color-none` | transparent |
| `--color-1` | #d5adff |
| `--color-1-translucent` | #d5adff66 |
| `--color-1-transparent` | #d5adff33 |
| `--color-2` | #9974b8 |
| `--color-2-translucent` | #9974b866 |
| `--color-2-transparent` | #9974b833 |
| `--color-3` | #94b8a4 |
| `--color-3-translucent` | #94b8a466 |
| `--color-3-transparent` | #94b8a433 |
| `--color-4` | #c6a492 |
| `--color-4-translucent` | #c6a49266 |
| `--color-4-transparent` | #c6a49233 |
| `--neutral-1` | #171719 |
| `--neutral-1-translucent` | #17171966 |
| `--neutral-1-transparent` | #17171933 |
| `--neutral-2` | #202023 |
| `--neutral-2-translucent` | #20202366 |
| `--neutral-2-transparent` | #20202333 |
| `--neutral-3` | #2a2a2e |
| `--neutral-3-translucent` | #2a2a2e66 |
| `--neutral-3-transparent` | #2a2a2e33 |
| `--neutral-4` | #3b3b40 |
| `--neutral-4-translucent` | #3b3b4066 |
| `--neutral-4-transparent` | #3b3b4033 |
| `--neutral-5` | #55555d |
| `--neutral-5-translucent` | #55555d66 |
| `--neutral-5-transparent` | #55555d33 |
| `--neutral-6` | #80808a |
| `--neutral-6-translucent` | #80808a66 |
| `--neutral-6-transparent` | #80808a33 |
| `--neutral-7` | #ababB4 |
| `--neutral-7-translucent` | #ababB466 |
| `--neutral-7-transparent` | #ababB433 |
| `--neutral-8` | #cdCDD3 |
| `--neutral-8-translucent` | #cdCDD366 |
| `--neutral-8-transparent` | #cdCDD333 |
| `--neutral-9` | #e8e8ed |
| `--neutral-9-translucent` | #e8e8ed66 |
| `--neutral-9-transparent` | #e8e8ed33 |
| `--neutral-10` | #fafafa |
| `--neutral-10-translucent` | #fafafa66 |
| `--neutral-10-transparent` | #fafafa33 |
| `--success` | #8fd5ad |
| `--success-translucent` | #8fd5ad66 |
| `--success-transparent` | #8fd5ad33 |
| `--warning` | #e5c279 |
| `--warning-translucent` | #e5c27966 |
| `--warning-transparent` | #e5c27933 |
| `--error` | #f49fa5 |
| `--error-translucent` | #f49fa566 |
| `--error-transparent` | #f49fa533 |
| `--on-color-1` | #202023 |
| `--on-color-2` | #000000 |
| `--on-color-3` | #000000 |
| `--on-color-4` | #000000 |
| `--on-success` | #000000 |
| `--on-warning` | #000000 |
| `--on-error` | #000000 |
| `--on-neutral-1` | #fafafa |
| `--on-neutral-2` | #fafafa |
| `--on-neutral-3` | #fafafa |
| `--on-neutral-4` | #fafafa |
| `--on-neutral-5` | #fafafa |
| `--on-neutral-6` | #171719 |
| `--on-neutral-7` | #171719 |
| `--on-neutral-8` | #171719 |
| `--on-neutral-9` | #171719 |
| `--on-neutral-10` | #171719 |
| `--shadow-none` | none |
| `--shadow-s` | 0px 0.25px 0.75px 0px #1717190d, 0px 1px 3px 0px #17171913 |
| `--shadow-m` | 0px 1px 4px 0px #1717190b, 0px 4px 16px 0px #17171910 |
| `--shadow-l` | 0px 3px 9px 0px #1717190f, 0px 12px 36px 0px #17171916 |
| `--cte-canvas` | #171719 |
| `--cte-surface` | #202023 |
| `--cte-surface-muted` | #2a2a2e |
| `--cte-text` | #fafafa |
| `--cte-text-muted` | #ababB4 |
| `--cte-border` | #80808a33 |
| `--cte-accent` | #d5adff |
| `--cte-accent-text` | #202023 |
| `--cte-danger` | #f49fa5 |
| `--cte-focus` | #d5adff |
| `--cte-font` | "Sidebar Inter", sans-serif |
| `--cte-font-size` | 14px |
| `--cte-font-weight` | 400 |
| `--cte-line-height` | 20px |
| `--cte-letter-spacing` | 0.01em |
| `--cte-detail-font-size` | 12px |
| `--cte-detail-line-height` | 16px |
| `--cte-detail-letter-spacing` | 0.01em |

## Authored component assignments

These are project edits. The [component reference](edit-here-components.md) includes the effective assignments with defaults and shared parts resolved.

```json
{
  "componentTokens": {
    "button:primary:rest": {
      "borderColor": "neutral-6-transparent",
      "shadow": "s"
    },
    "button:primary:hover": {
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
    "button:primary:focus": {
      "borderColor": "neutral-7-transparent",
      "shadow": "s"
    },
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
    "button:outline:rest": {
      "borderColor": "neutral-6-transparent"
    }
  },
  "componentVariants": {}
}
```
