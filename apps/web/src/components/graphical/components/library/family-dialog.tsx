'use client';

import { Button as BaseButton } from '@base-ui/react/button';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { themeFamily, themePart } from "./component-theme";

// Split out of primitives.tsx and consumer.tsx so the dialog loads apart from the other families.

export const ThemedDialog = themeFamily(BaseDialog, () => ({
  Trigger: themePart(BaseDialog.Trigger, 'dialog', 'trigger', 'ui-button'),
  Popup: themePart(BaseDialog.Popup, 'dialog', 'popover', 'ui-popup ui-modal'),
  Backdrop: themePart(BaseDialog.Backdrop, 'dialog', 'backdrop', 'ui-backdrop'),
  Title: themePart(BaseDialog.Title, 'dialog', 'title', 'ui-title'),
  Description: themePart(
    BaseDialog.Description,
    'dialog',
    'description',
    'ui-copy',
  ),
  Close: themePart(BaseDialog.Close, 'dialog', 'close', 'ui-button'),
}));

export const Dialog = themeFamily(ThemedDialog, () => ({
  Action: themePart(BaseButton, 'dialog', 'action', 'ui-button'),
}));
