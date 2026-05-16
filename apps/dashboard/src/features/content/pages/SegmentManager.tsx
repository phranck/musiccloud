import type { ContentPage } from "@musiccloud/shared";
import { DEFAULT_LOCALE, getLocalizedText, type Locale } from "@musiccloud/shared";
import { RowsIcon } from "@phosphor-icons/react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { NumberCircleIcon } from "@/components/ui/NumberCircleIcon";
import { useI18n } from "@/context/I18nContext";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { normalizeSegmentEntry } from "@/features/content/state/slices/segmentsSlice";

interface Props {
  page: ContentPage;
  activeLocale: Locale;
}

export function SegmentManager({ page, activeLocale }: Props) {
  const { messages } = useI18n();
  const text = messages.content.pages.segments;
  const editor = usePagesEditor();

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
                  value={getLocalizedText(segment.label, activeLocale, DEFAULT_LOCALE).value}
                  onChange={(e) =>
                    editor.dispatch.segments({
                      type: "set-label",
                      owner: page.slug,
                      target: segment.targetSlug,
                      locale: activeLocale,
                      label: e.target.value,
                    })
                  }
                  placeholder={
                    getLocalizedText(segment.label, activeLocale, DEFAULT_LOCALE).fallback || text.labelPlaceholder
                  }
                  className="flex-1 min-w-[140px] h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <span className="text-xs text-[var(--ds-text-muted)] font-mono">/{segment.targetSlug}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
