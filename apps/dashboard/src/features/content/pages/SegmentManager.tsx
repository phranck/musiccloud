import type { ContentPage } from "@musiccloud/shared";
import { DEFAULT_LOCALE, getLocalizedText, LOCALES, type Locale } from "@musiccloud/shared";
import { CaretDownIcon, CaretUpIcon, RowsIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { NumberCircleIcon } from "@/components/ui/NumberCircleIcon";
import { useI18n } from "@/context/I18nContext";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { normalizeSegmentEntry } from "@/features/content/state/slices/segmentsSlice";

interface Props {
  page: ContentPage;
}

export function SegmentManager({ page }: Props) {
  const { messages } = useI18n();
  const text = messages.content.pages.segments;
  const editor = usePagesEditor();

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const nonDefaultLocales = LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);
  const localeFlag: Record<string, string> = { de: "🇩🇪" };

  // Sidebar's PagesGroup hydrates the segments slice on mount with every
  // segmented owner, so by the time the user gets to interact with this view
  // byOwner[page.slug] is already populated. Fall back to page.segments for
  // the brief first-render window before the hydrate effect commits.
  const sliceCurrent = editor.segments.byOwner[page.slug]?.current;
  const segments =
    sliceCurrent ??
    page.segments.map((s, i) =>
      normalizeSegmentEntry({
        position: i,
        label: s.label,
        targetSlug: s.targetSlug,
        translations: s.translations,
      }),
    );

  function toggleExpanded(targetSlug: string) {
    setExpandedRows((prev) => ({ ...prev, [targetSlug]: !prev[targetSlug] }));
  }

  return (
    <DashboardSection>
      <DashboardSection.Header icon={<RowsIcon weight="duotone" className="w-4 h-4" />} title={text.title} />
      <DashboardSection.Body>
        {segments.length === 0 ? (
          <p className="text-xs text-[var(--ds-text-muted)]">{text.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {segments.map((segment, index) => (
              <li
                key={segment.targetSlug}
                className="flex flex-wrap items-center gap-2 border border-[var(--ds-border)] rounded-control bg-[var(--ds-surface)] px-3 py-2"
              >
                <span
                  aria-hidden
                  className="shrink-0 flex items-center justify-center w-6 h-6 text-[var(--ds-text-subtle)]"
                >
                  <NumberCircleIcon number={index + 1} className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  value={getLocalizedText(segment.label, DEFAULT_LOCALE, DEFAULT_LOCALE).value}
                  onChange={(e) =>
                    editor.dispatch.segments({
                      type: "set-label",
                      owner: page.slug,
                      target: segment.targetSlug,
                      locale: DEFAULT_LOCALE,
                      label: e.target.value,
                    })
                  }
                  placeholder={text.labelPlaceholder}
                  className="flex-1 min-w-[140px] h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--ds-text-muted)] font-mono">/{segment.targetSlug}</span>
                <div className="w-full">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(segment.targetSlug)}
                    className="flex items-center gap-1 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] select-none"
                  >
                    {expandedRows[segment.targetSlug] ? (
                      <CaretUpIcon className="w-3 h-3" />
                    ) : (
                      <CaretDownIcon className="w-3 h-3" />
                    )}
                    <span className="uppercase tracking-wide font-medium">Translations</span>
                  </button>
                  {expandedRows[segment.targetSlug] && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {nonDefaultLocales.map((locale) => (
                        <div key={locale} className="flex items-center gap-2">
                          <span className="w-10 shrink-0 text-[10px] font-semibold uppercase text-[var(--ds-text-subtle)] tracking-widest">
                            {localeFlag[locale] ?? ""} {locale.toUpperCase()}
                          </span>
                          <input
                            type="text"
                            value={getLocalizedText(segment.label, locale, DEFAULT_LOCALE).value}
                            placeholder={
                              getLocalizedText(segment.label, DEFAULT_LOCALE, DEFAULT_LOCALE).value ||
                              text.labelPlaceholder
                            }
                            onChange={(e) =>
                              editor.dispatch.segments({
                                type: "set-translation",
                                owner: page.slug,
                                target: segment.targetSlug,
                                locale,
                                label: e.target.value,
                              })
                            }
                            className="flex-1 h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] placeholder:text-[var(--ds-text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
