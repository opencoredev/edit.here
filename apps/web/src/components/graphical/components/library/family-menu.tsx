'use client';

import { Menu as BaseMenu } from '@base-ui/react/menu';
import { themeContainer, themeFamily, themePart } from "./component-theme";
import { MenuItemContent } from "./menu-item-content";

// Split out of primitives.tsx and consumer.tsx so menus load apart from the other families.

export const ThemedMenu = themeFamily(BaseMenu, () => ({
  Trigger: themePart(BaseMenu.Trigger, 'menu', 'trigger', 'ui-button'),
  Positioner: themeContainer(BaseMenu.Positioner, 'ui-positioner'),
  Popup: themePart(
    BaseMenu.Popup,
    'menu',
    'popover',
    'ui-popup ui-menu ui-menu-detailed',
  ),
  ItemContent: MenuItemContent,
  Item: themePart(BaseMenu.Item, 'menu', 'option', 'ui-option'),
  SubmenuTrigger: themePart(
    BaseMenu.SubmenuTrigger,
    'menu',
    'option',
    'ui-option',
  ),
  GroupLabel: themePart(
    BaseMenu.GroupLabel,
    'menu',
    'label',
    'ui-menu-group-label',
  ),
  CheckboxItem: themePart(BaseMenu.CheckboxItem, 'menu', 'option', 'ui-option'),
  CheckboxItemIndicator: themePart(
    BaseMenu.CheckboxItemIndicator,
    'menu',
    'indicator',
    'ui-mark',
  ),
  RadioItem: themePart(BaseMenu.RadioItem, 'menu', 'option', 'ui-option'),
  RadioItemIndicator: themePart(
    BaseMenu.RadioItemIndicator,
    'menu',
    'indicator',
    'ui-mark',
  ),
  Separator: themePart(BaseMenu.Separator, 'menu', 'separator', 'ui-separator'),
}));

export const Menu = ThemedMenu;
