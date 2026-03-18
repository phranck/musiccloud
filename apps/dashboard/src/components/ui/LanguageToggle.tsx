import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useI18n } from "@/context/I18nContext";
import type { DashboardLocale } from "@/i18n/messages";

const LANGUAGE_OPTIONS = [
  { value: "de" as const, label: "DE" },
  { value: "en" as const, label: "EN" },
];

export function LanguageToggle({
  value,
  onChange,
}: {
  value?: DashboardLocale;
  onChange?: (locale: DashboardLocale) => void;
}) {
  const { locale, setLocale } = useI18n();
  return (
    <SegmentedControl<DashboardLocale>
      value={value ?? locale}
      onChange={onChange ?? setLocale}
      options={LANGUAGE_OPTIONS}
    />
  );
}
