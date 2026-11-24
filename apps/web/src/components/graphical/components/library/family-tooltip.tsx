'use client';

import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import { themeContainer, themeFamily, themePart } from "./component-theme";

// Split out of primitives.tsx and consumer.tsx so tooltips load apart from the other families.

export const ThemedTooltip = themeFamily(BaseTooltip, () => ({
  Trigger: themePart(BaseTooltip.Trigger, 'tooltip', 'trigger', 'ui-button'),
  Popup: themePart(
    BaseTooltip.Popup,
    'tooltip',
    'popover',
    'ui-popup ui-tooltip',
  ),
}));

export const Tooltip = themeFamily(ThemedTooltip, () => ({
  Positioner: themeContainer(ThemedTooltip.Positioner, 'ui-positioner'),
}));
