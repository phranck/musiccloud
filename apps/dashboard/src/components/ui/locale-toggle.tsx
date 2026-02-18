import { useLocale } from "@/i18n/context";
import { LOCALES, LOCALE_META } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            "px-2 h-full text-xs font-medium transition-colors",
            locale === l
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {LOCALE_META[l].flag} {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
