import type { NavItem } from "@musiccloud/shared";

import { useT } from "@/i18n/context";
import { navHref, navLabel } from "@/lib/nav";

const START_YEAR = 2026;

interface AppFooterProps {
  /** Items from the admin nav editor (footer). Rendered in the centre column. */
  navItems?: NavItem[];
}

const EMPTY_NAV_ITEMS: NavItem[] = [];

/**
 * Application footer: copyright + admin-managed centre nav + "made by LAYERED" link.
 * Used on all pages (landing page via LandingPage.tsx, share page via Astro SSR).
 * Must be rendered inside a LocaleProvider (or via AppFooterIsland for standalone use).
 */
export function AppFooter({ navItems = EMPTY_NAV_ITEMS }: AppFooterProps) {
  const t = useT();
  const currentYear = new Date().getFullYear();
  const yearDisplay = currentYear > START_YEAR ? `${START_YEAR} – ${currentYear}` : `${START_YEAR}`;

  return (
    <footer
      className="w-full grid grid-cols-3 items-center px-4 sm:px-6 py-3 text-xs text-text-muted"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <span className="text-left">&copy; {yearDisplay} musiccloud</span>
      <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {navItems.map((item) => (
          <a
            key={item.id}
            href={navHref(item)}
            target={item.target === "_blank" ? "_blank" : undefined}
            rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
            className="hover:text-text-secondary transition-colors duration-150"
          >
            {navLabel(item)}
          </a>
        ))}
      </nav>
      <span className="text-right">
        {t("footer.madeBy")}{" "}
        <a
          href="https://layered.work"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors duration-150 ml-1"
        >
          LAYERED
        </a>
      </span>
    </footer>
  );
}
