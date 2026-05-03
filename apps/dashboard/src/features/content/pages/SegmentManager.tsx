import type { ContentPage, ContentPageSummary, PageSegmentInput } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@musiccloud/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretUpIcon,
  EyeIcon,
  PlusCircleIcon,
  RowsIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { DashboardSegmentedControl } from "@/components/ui/DashboardSegmentedControl";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { MarkdownEditor } from "@/components/ui/MarkdownEditor";
import { NumberCircleIcon } from "@/components/ui/NumberCircleIcon";
import { useI18n } from "@/context/I18nContext";
import {
  useAdminContentPage,
  useContentPages,
  useSaveContentPage,
  useSaveContentPageSegments,
} from "@/features/content/hooks/useAdminContent";
import { FormLabelText } from "@/shared/ui/FormPrimitives";

export type SegmentSaveFn = () => Promise<void>;

interface Props {
  page: ContentPage;
  onSaved?: () => void;
  /** Register the manager's save routine so the page-editor header's Save
   * button and Cmd+S can persist draft segments + target-page content. */
  saveRef?: MutableRefObject<SegmentSaveFn | null>;
}

interface DraftSegment extends PageSegmentInput {
  /** Client-side only — unique per draft entry across re-orders + renames. */
  localId: string;
}

function toDraft(page: ContentPage): DraftSegment[] {
  return page.segments.map((s, i) => ({
    localId: `server-${s.id}`,
    position: i,
    label: s.label,
    targetSlug: s.targetSlug,
    ...(s.translations ? { translations: s.translations } : {}),
  }));
}

function nextLocalId(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function translationsEqual(
  a: Partial<Record<Locale, string>> | undefined,
  b: Partial<Record<Locale, string>> | undefined,
): boolean {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if ((a as Record<string, string>)[k] !== (b as Record<string, string> | undefined)?.[k]) return false;
  }
  return true;
}

function segmentsEqual(a: DraftSegment[], b: ContentPage["segments"]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].targetSlug !== b[i].targetSlug) return false;
    if (!translationsEqual(a[i].translations, b[i].translations)) return false;
  }
  return true;
}

export function SegmentManager({ page, onSaved, saveRef }: Props) {
  const { messages } = useI18n();
  const text = messages.content.pages.segments;
  const editorMessages = messages.content.editor;
  const { data: allPages = [] } = useContentPages();
  const saveSegments = useSaveContentPageSegments();
  const saveTarget = useSaveContentPage();

  const defaultPages = useMemo(
    () => allPages.filter((p: ContentPageSummary) => p.pageType === "default" && p.slug !== page.slug),
    [allPages, page.slug],
  );

  const [draft, setDraft] = useState<DraftSegment[]>(() => toDraft(page));
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [targetDraftContent, setTargetDraftContent] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const nonDefaultLocales = LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);
  const localeFlag: Record<string, string> = { de: "🇩🇪" };

  useEffect(() => {
    if (draft.length === 0) return;
    if (activeIndex >= draft.length) {
      setActiveIndex(Math.max(0, draft.length - 1));
      setTargetDraftContent(null);
    }
  }, [draft, activeIndex]);

  const activeSegment = draft[activeIndex] ?? null;
  const activeTargetSlug = activeSegment?.targetSlug ?? null;

  const { data: targetPage } = useAdminContentPage(activeTargetSlug ?? undefined);

  // Expose latest values to the registered save closure without retriggering it.
  const stateRef = useRef({
    draft,
    targetPage,
    activeTargetSlug,
    targetDraftContent,
  });
  stateRef.current = { draft, targetPage, activeTargetSlug, targetDraftContent };

  // Register the save function with the parent. Runs once; reads fresh state
  // via the ref above so we never capture stale closures.
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = async () => {
      const {
        draft: currentDraft,
        targetPage: currentTargetPage,
        activeTargetSlug: currentTargetSlug,
        targetDraftContent: currentDraftContent,
      } = stateRef.current;

      setError(null);

      // Pre-check: every draft segment needs a non-empty label and target.
      // Backend would reject this anyway (empty label = INVALID_INPUT,
      // empty target = TARGET_NOT_FOUND), but blocking client-side avoids
      // the round-trip and shows a clear inline error immediately.
      if (!currentDraft.every((s) => s.label.trim().length > 0 && s.targetSlug)) {
        setError(text.invalidSegments);
        return;
      }

      let didAnything = false;

      // 1. Persist segment list if it differs from the server state.
      if (!segmentsEqual(currentDraft, page.segments)) {
        try {
          await saveSegments.mutateAsync({
            slug: page.slug,
            segments: currentDraft.map((s, i) => {
              const base = { position: i, label: s.label, targetSlug: s.targetSlug };
              const tx = Object.entries(s.translations ?? {}).filter(
                ([, v]) => typeof v === "string" && v.trim().length > 0,
              );
              return tx.length > 0 ? { ...base, translations: Object.fromEntries(tx) } : base;
            }),
          });
          didAnything = true;
        } catch (err) {
          setError(err instanceof Error ? err.message : text.saveError);
          return;
        }
      }

      // 2. Persist target-page body if the user edited it inline.
      if (
        currentTargetPage &&
        currentTargetSlug &&
        currentDraftContent !== null &&
        currentDraftContent !== currentTargetPage.content
      ) {
        try {
          await saveTarget.mutateAsync({
            slug: currentTargetSlug,
            data: { content: currentDraftContent },
          });
          setTargetDraftContent(null);
          didAnything = true;
        } catch (err) {
          setError(err instanceof Error ? err.message : text.saveError);
          return;
        }
      }

      if (didAnything) onSaved?.();
    };
    return () => {
      saveRef.current = null;
    };
  }, [saveRef, page.slug, page.segments, saveSegments, saveTarget, onSaved, text.saveError, text.invalidSegments]);

  function move(index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= draft.length) return;
    const next = draft.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraft(next.map((s, i) => ({ ...s, position: i })));
    if (activeIndex === index) setActiveIndex(nextIndex);
    else if (activeIndex === nextIndex) setActiveIndex(index);
  }

  function remove(index: number) {
    const next = draft.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i }));
    setDraft(next);
    if (next.length === 0) {
      setActiveIndex(0);
    } else if (index <= activeIndex) {
      setActiveIndex(Math.max(0, activeIndex - 1));
    }
    setTargetDraftContent(null);
  }

  function update(index: number, patch: Partial<PageSegmentInput>) {
    setDraft(draft.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    if (index === activeIndex && patch.targetSlug !== undefined) {
      setTargetDraftContent(null);
    }
  }

  function toggleExpanded(localId: string) {
    setExpandedRows((prev) => ({ ...prev, [localId]: !prev[localId] }));
  }

  function updateTranslation(index: number, locale: Locale, value: string) {
    setDraft(
      draft.map((s, i) => {
        if (i !== index) return s;
        const next = { ...(s.translations ?? {}) };
        if (value.trim().length === 0) {
          delete next[locale];
        } else {
          next[locale] = value;
        }
        return { ...s, translations: next };
      }),
    );
  }

  function addSegment() {
    const nextIndex = draft.length;
    const nextDraft: DraftSegment[] = [
      ...draft,
      { localId: nextLocalId(), position: nextIndex, label: "", targetSlug: "" },
    ];
    setDraft(nextDraft);
    setActiveIndex(nextIndex);
  }

  const currentContent = targetDraftContent ?? targetPage?.content ?? "";

  function handleTargetContentChange(next: string) {
    setTargetDraftContent(next);
  }

  const previewSegments = draft.map((s, i) => ({
    key: String(i),
    label: s.label.trim() || text.labelPlaceholder,
  }));

  const targetDropdownOptions: DropdownOption<string>[] = defaultPages.map((p) => ({
    value: p.slug,
    label: `${p.title} (/${p.slug})`,
  }));

  return (
    <>
      <DashboardSection>
        <DashboardSection.Header
          icon={<RowsIcon weight="duotone" className="w-4 h-4" />}
          title={text.title}
          addOn={
            <button
              type="button"
              onClick={addSegment}
              className="flex items-center gap-1.5 px-3 h-8 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-xs font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
            >
              <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
              {text.addSegment}
            </button>
          }
        />
        <DashboardSection.Body>
          {draft.length === 0 ? (
            <p className="text-xs text-[var(--ds-text-muted)]">{text.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {draft.map((segment, index) => {
                const dropdownValue = segment.targetSlug;
                const options =
                  segment.targetSlug && !targetDropdownOptions.some((o) => o.value === segment.targetSlug)
                    ? [{ value: segment.targetSlug, label: `/${segment.targetSlug}` }, ...targetDropdownOptions]
                    : targetDropdownOptions;
                return (
                  <li
                    key={segment.localId}
                    className="flex flex-wrap items-center gap-2 border border-[var(--ds-border)] rounded-control bg-[var(--ds-surface)] px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-pressed={index === activeIndex}
                      aria-label={`${index + 1}`}
                      className={`shrink-0 flex items-center justify-center w-6 h-6 ${
                        index === activeIndex ? "text-[var(--color-primary)]" : "text-[var(--ds-text-subtle)]"
                      }`}
                    >
                      <NumberCircleIcon number={index + 1} className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={segment.label}
                      onFocus={() => setActiveIndex(index)}
                      onChange={(e) => update(index, { label: e.target.value })}
                      placeholder={text.labelPlaceholder}
                      className="flex-1 min-w-[140px] h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                    <div className="w-64">
                      <Dropdown
                        size="sm"
                        value={dropdownValue}
                        options={options}
                        placeholder={text.targetPlaceholder}
                        onChange={(v) => {
                          setActiveIndex(index);
                          update(index, { targetSlug: v });
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        title={text.moveUp}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
                      >
                        <ArrowUpIcon weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, +1)}
                        disabled={index === draft.length - 1}
                        title={text.moveDown}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
                      >
                        <ArrowDownIcon weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        title={text.remove}
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--ds-btn-danger-text)] hover:bg-[var(--ds-btn-danger-hover-bg)]"
                      >
                        <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Translations expandable */}
                    <div className="w-full">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(segment.localId)}
                        className="flex items-center gap-1 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] select-none"
                      >
                        {expandedRows[segment.localId] ? (
                          <CaretUpIcon className="w-3 h-3" />
                        ) : (
                          <CaretDownIcon className="w-3 h-3" />
                        )}
                        <span className="uppercase tracking-wide font-medium">Translations</span>
                      </button>
                      {expandedRows[segment.localId] && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {nonDefaultLocales.map((locale) => (
                            <div key={locale} className="flex items-center gap-2">
                              <span className="w-10 shrink-0 text-[10px] font-semibold uppercase text-[var(--ds-text-subtle)] tracking-widest">
                                {localeFlag[locale] ?? ""} {locale.toUpperCase()}
                              </span>
                              <input
                                type="text"
                                value={segment.translations?.[locale] ?? ""}
                                placeholder={segment.label || text.labelPlaceholder}
                                onChange={(e) => updateTranslation(index, locale, e.target.value)}
                                className="flex-1 h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] placeholder:text-[var(--ds-text-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </DashboardSection.Body>
      </DashboardSection>

      {draft.length > 0 && activeSegment && (
        <DashboardSection>
          <DashboardSection.Header icon={<EyeIcon weight="duotone" className="w-4 h-4" />} title={text.preview} />
          <DashboardSection.Body>
            <DashboardSegmentedControl
              segments={previewSegments}
              value={String(activeIndex)}
              onChange={(next) => {
                const idx = Number.parseInt(next, 10);
                if (Number.isNaN(idx)) return;
                setActiveIndex(idx);
                setTargetDraftContent(null);
              }}
            />

            <FormLabelText className="mb-0">
              {targetPage?.title ?? activeTargetSlug} (/{activeTargetSlug})
            </FormLabelText>

            {targetPage ? (
              <MarkdownEditor
                key={activeTargetSlug ?? "none"}
                value={currentContent}
                onChange={handleTargetContentChange}
                height="100%"
                showHints
              />
            ) : (
              <div className="h-[420px] bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded-control animate-pulse" />
            )}

            {saveTarget.isError && <p className="text-xs text-red-500">{editorMessages.saveError}</p>}
          </DashboardSection.Body>
        </DashboardSection>
      )}
    </>
  );
}
