import type { ReactNode } from 'react';
import { ChevronRight } from "./control-icons";

/** Item anatomy shared by menus and submenus, independent of specimen data. */
export function MenuItemContent({
  children,
  icon,
  shortcut,
  submenu = false,
}: {
  children: ReactNode;
  icon?: ReactNode | undefined;
  shortcut?: string | undefined;
  submenu?: boolean | undefined;
}) {
  return (
    <span
      className="ui-menu-item-content"
      data-menu-icon={icon != null || undefined}
    >
      <span className="ui-menu-item-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ui-menu-item-label">{children}</span>
      {shortcut && (
        <kbd className="ui-menu-shortcut" aria-hidden="true">
          {shortcut}
        </kbd>
      )}
      {submenu && (
        <ChevronRight className="ui-menu-submenu-arrow" aria-hidden="true" />
      )}
    </span>
  );
}
