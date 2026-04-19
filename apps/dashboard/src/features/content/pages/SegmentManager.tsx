import type { ContentPage, ContentPageSummary, PageSegmentInput } from "@musiccloud/shared";
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, PlusCircleIcon, RowsIcon, TrashIcon } from "@phosphor-icons/react";
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
import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";
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
  }));
}

function nextLocalId(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function segmentsEqual(a: DraftSegment[], b: ContentPage["segments"]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].label !== b[i].label || a[i].targetSlug !== b[i].targetSlug) return false;
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
  const [newPageForIndex, setNewPageForIndex] = useState<number | null>(null);

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

  const canSave = draft.every((s) => s.label.trim().length > 0 && s.targetSlug);

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
      let didAnything = false;

      // 1. Persist segment list if it differs from the server state.
      if (!segmentsEqual(currentDraft, page.segments)) {
        try {
          await saveSegments.mutateAsync({
            slug: page.slug,
            segments: currentDraft.map((s, i) => ({
              position: i,
              label: s.label,
              targetSlug: s.targetSlug,
            })),
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
  }, [saveRef, page.slug, page.segments, saveSegments, saveTarget, onSaved, text.saveError]);

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

  function addSegment() {
    const targetSlug = defaultPages[0]?.slug;
    if (!targetSlug) return;
    const nextDraft: DraftSegment[] = [
      ...draft,
      { localId: nextLocalId(), position: draft.length, label: "", targetSlug },
    ];
    setDraft(nextDraft);
    setActiveIndex(nextDraft.length - 1);
  }

  const currentContent = targetDraftContent ?? targetPage?.content ?? "";

  function handleTargetContentChange(next: string) {
    setTargetDraftContent(next);
  }

  if (defaultPages.length === 0 && draft.length === 0) {
    return <div className="px-6 py-6 text-sm text-[var(--ds-text-muted)]">{text.noDefaultPages}</div>;
  }

  const previewSegments = draft.map((s, i) => ({
    key: String(i),
    label: s.label.trim() || text.labelPlaceholder,
  }));

  const targetDropdownOptions: DropdownOption<string>[] = defaultPages.map((p) => ({
    value: p.slug,
    label: `${p.title} (/${p.slug})`,
  }));

  void canSave; // kept for potential future UI (e.g. block parent save); no in-card button

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
              disabled={defaultPages.length === 0}
              className="flex items-center gap-1.5 px-3 h-8 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-xs font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                const dropdownValue = targetDropdownOptions.some((o) => o.value === segment.targetSlug)
                  ? segment.targetSlug
                  : segment.targetSlug || (targetDropdownOptions[0]?.value ?? "");
                const options = targetDropdownOptions.some((o) => o.value === segment.targetSlug)
                  ? targetDropdownOptions
                  : [
                      ...(segment.targetSlug ? [{ value: segment.targetSlug, label: `/${segment.targetSlug}` }] : []),
                      ...targetDropdownOptions,
                    ];
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
                        onChange={(v) => {
                          setActiveIndex(index);
                          update(index, { targetSlug: v });
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewPageForIndex(index)}
                      title={messages.content.pages.newPage}
                      className="flex items-center gap-1.5 h-7 px-2 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-xs font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
                    >
                      <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
                      {messages.content.pages.newPage}
                    </button>
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

      <CreatePageDialog
        open={newPageForIndex !== null}
        lockDefaultType
        onClose={() => setNewPageForIndex(null)}
        onCreated={(newPage) => {
          if (newPageForIndex === null) return;
          const idx = newPageForIndex;
          update(idx, { targetSlug: newPage.slug });
          setActiveIndex(idx);
          setNewPageForIndex(null);
        }}
      />
    </>
  );
}
