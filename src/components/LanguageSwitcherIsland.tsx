import { LocaleProvider } from "../i18n/context";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Standalone wrapper that provides LocaleProvider context for the LanguageSwitcher.
 * Used as a React island on SSR pages (share page) where no global LocaleProvider exists.
 */
export function LanguageSwitcherIsland() {
  return (
    <LocaleProvider>
      <LanguageSwitcher />
    </LocaleProvider>
  );
}
