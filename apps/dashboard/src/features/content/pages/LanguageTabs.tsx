import type { Locale, TranslationStatus } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES } from "@musiccloud/shared";
import { CheckCircleIcon, QuestionIcon, WarningCircleIcon, WarningIcon } from "@phosphor-icons/react";

export interface LanguageTabState {
  status: TranslationStatus;
  dirty: boolean;
}

interface Props {
  active: Locale;
  states: Record<Locale, LanguageTabState>;
  onSelect: (locale: Locale) => void;
}

const FLAG: Record<Locale, string> = { en: "🇬🇧", de: "🇩🇪" };

function StatusIcons({ locale, state }: { locale: Locale; state: LanguageTabState }) {
  const isDefault = locale === DEFAULT_LOCALE;

  return (
    <span className="inline-flex items-center gap-0.5">
      {!isDefault && state.status === "ready" && (
        <CheckCircleIcon size={14} weight="duotone" className="text-emerald-500" />
      )}
      {!isDefault && state.status === "stale" && <WarningIcon size={14} weight="duotone" className="text-amber-500" />}
      {!isDefault && state.status === "missing" && (
        <QuestionIcon size={14} weight="duotone" className="text-[var(--ds-text-muted)] opacity-60" />
      )}
      {state.dirty && <WarningCircleIcon size={14} weight="duotone" className="text-[var(--color-primary)]" />}
    </span>
  );
}

/**
 * Tab bar rendering one tab per locale.
 * Active tab is visually distinguished via a bottom border in the primary
 * accent color and bold text. Each tab carries status/dirty markers.
 */
export function LanguageTabs({ active, states, onSelect }: Props) {
  return (
    <div className="flex gap-2 border-b border-[var(--ds-border)]">
      {LOCALES.map((locale) => {
        const state = states[locale];
        const isActive = active === locale;
        const ariaLabel = `${FLAG[locale]} ${locale.toUpperCase()} tab, status: ${state.status}${state.dirty ? ", unsaved" : ""}`;
        const hasIcons = locale !== DEFAULT_LOCALE || state.dirty;

        return (
          <button
            key={locale}
            type="button"
            onClick={() => onSelect(locale)}
            aria-pressed={isActive}
            aria-label={ariaLabel}
            className={`px-3 py-2 -mb-px border-b-2 text-sm transition-colors ${
              isActive
                ? "border-[var(--color-primary)] font-semibold text-[var(--ds-text)]"
                : "border-transparent text-[var(--ds-text-muted)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
            }`}
          >
            <span className="mr-1">{FLAG[locale]}</span>
            <span className="uppercase tracking-wide">{locale}</span>
            {hasIcons && (
              <span className="ml-2">
                <StatusIcons locale={locale} state={state} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
