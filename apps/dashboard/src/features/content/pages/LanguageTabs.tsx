import type { Locale, TranslationStatus } from "@musiccloud/shared";
import { LOCALES } from "@musiccloud/shared";

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

function badges(state: LanguageTabState): string {
  const parts: string[] = [];
  if (state.dirty) parts.push("•");
  if (state.status === "stale") parts.push("⚠︎");
  else if (state.status === "ready") parts.push("●");
  else if (state.status === "draft" || state.status === "missing") parts.push("○");
  return parts.join(" ");
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
        const marker = badges(state);
        const label = `${FLAG[locale]} ${locale.toUpperCase()}`;
        const ariaLabel = `${label} tab, status: ${state.status}${state.dirty ? ", unsaved" : ""}`;

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
            {marker && <span className="ml-2 text-xs">{marker}</span>}
          </button>
        );
      })}
    </div>
  );
}
