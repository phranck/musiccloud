import { VerticalSegmentedControl } from "@/components/ui/VerticalSegmentedControl";
import { useLocale, useT } from "@/i18n/localeContext";
import { LOCALE_META, LOCALES } from "@/i18n/locales";
import { languageSignal, sendMusicSignal } from "@/lib/analytics/umami";

/**
 * Header control switching the active UI locale.
 *
 * The UI is an icon-only `EmbossedSegmentedControl`: every available locale is
 * a persistently visible segment whose decorative (`aria-hidden`) flag emoji
 * sits in front of its translated language name, which doubles as the button's
 * accessible name. The flags are emoji strings rather than Phosphor icons
 * because Phosphor ships no country flags; the explicit `text-[16px]` span sizes
 * the emoji to visually match the 18px Phosphor icons in the other header control
 * (emoji render fuller than line icons at the same px). The control sits in a
 * `<fieldset>` whose visually-hidden `<legend>` names the group via the
 * `language.label` key.
 *
 * The locale binds to the shared `LocaleProvider` context (`useLocale`) rather
 * than a standalone store, so `value` simply mirrors the context locale. The
 * analytics signal fires only on actual locale CHANGES, mirroring the
 * DayNightSwitcher.
 */
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();

  const handleChange = (next: (typeof LOCALES)[number]) => {
    if (next !== locale) sendMusicSignal(languageSignal(next));
    setLocale(next);
  };

  const segments = LOCALES.map((code) => ({
    key: code,
    label: "",
    ariaLabel: LOCALE_META[code].label,
    icon: (
      <span aria-hidden="true" className="text-[16px] leading-none">
        {LOCALE_META[code].flag}
      </span>
    ),
  }));

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{t("language.label")}</legend>
      <VerticalSegmentedControl segments={segments} value={locale} onChange={handleChange} />
    </fieldset>
  );
}
