import { LocaleProvider } from "../i18n/context";
import { PageHeader } from "./PageHeader";

/**
 * Standalone React island for SSR Astro pages (e.g. share page).
 * Wraps PageHeader in its own LocaleProvider since no global provider exists.
 * Always renders without the Info Button (share page has no InfoPanel).
 */
export function PageHeaderIsland() {
  return (
    <LocaleProvider>
      <PageHeader />
    </LocaleProvider>
  );
}
