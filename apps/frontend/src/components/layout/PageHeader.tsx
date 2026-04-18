import type { NavItem } from "@musiccloud/shared";

import { LanguageSwitcher } from "@/components/navigation/LanguageSwitcher";
import { InfoButton } from "@/components/ui/InfoButton";

interface PageHeaderProps {
  /** Show the circular info button (landing page and result pages only) */
  showInfoButton?: boolean;
  onInfoClick?: () => void;
  /** Items from the admin nav editor (header). Empty array hides the inline list. */
  navItems?: NavItem[];
}

function navHref(item: NavItem): string {
  return item.url ?? (item.pageSlug ? `/${item.pageSlug}` : "#");
}

function navLabel(item: NavItem): string {
  return item.label || item.pageTitle || item.url || "—";
}

/**
 * Fixed top-right header bar: optional admin-managed nav links, Language Switcher,
 * optional Info Button. Must be rendered inside a LocaleProvider.
 */
export function PageHeader({ showInfoButton = false, onInfoClick, navItems = [] }: PageHeaderProps) {
  return (
    <div className="fixed top-4 right-4 z-40 hidden sm:flex items-center gap-3">
      {navItems.length > 0 && (
        <nav aria-label="Header navigation" className="flex items-center gap-4 mr-2 text-sm">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={navHref(item)}
              target={item.target === "_blank" ? "_blank" : undefined}
              rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
              className="text-text-secondary hover:text-text-primary transition-colors duration-150"
            >
              {navLabel(item)}
            </a>
          ))}
        </nav>
      )}
      <div className="flex items-center gap-1">
        <LanguageSwitcher />
        {showInfoButton && onInfoClick && <InfoButton onClick={onInfoClick} />}
      </div>
    </div>
  );
}
