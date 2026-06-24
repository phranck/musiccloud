import type { PublicContentPage } from "@musiccloud/shared";

import { OverlayShell } from "@/components/layout/OverlayShell";
import { OverlayProvider } from "@/context/OverlayContext";
import { LocaleProvider } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";

interface Props {
  initialPage: PublicContentPage | null;
  /** Server-resolved locale, so SSR and client hydration agree (no mismatch). */
  initialLocale?: Locale;
}

/**
 * Hydration entry point for the content-page overlay. Wires the locale and
 * overlay providers around the {@link OverlayShell}, which renders the
 * draggable/resizable frame and its content. Mounted once per page as an Astro
 * island; `initialPage` is only set on a direct SSR load of an overlay page.
 *
 * @param initialPage - the page to open immediately on direct load, or null
 * @param initialLocale - the server-resolved locale to seed the locale provider
 */
export function PageOverlayIsland({ initialPage, initialLocale }: Props) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <OverlayProvider initialPage={initialPage}>
        <OverlayShell />
      </OverlayProvider>
    </LocaleProvider>
  );
}
