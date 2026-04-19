import type { ContentPage, ContentPageSummary, PageSegmentInput } from "@musiccloud/shared";
import { ArrowDownIcon, ArrowUpIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { EmbossedSegmentedControl } from "@/components/ui/EmbossedSegmentedControl";
import { useI18n } from "@/context/I18nContext";
import {
  useAdminContentPage,
  useContentPages,
  useSaveContentPage,
  useSaveContentPageSegments,
} from "@/features/content/hooks/useAdminContent";
import { FormLabelText } from "@/shared/ui/FormPrimitives";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

interface Props {
  page: ContentPage;
}

interface DraftSegment extends PageSegmentInput {
  /** Client-side only — unique per draft entry (server ids do not apply before save). */
  localId: string;
}

function toDraft(page: ContentPage): DraftSegment[] {
  return page.segments.map((s, i) => ({
    localId: `${s.id}`,
    position: i,
    label: s.label,
    targetSlug: s.targetSlug,
  }));
}

export function SegmentManager({ page }: Props) {
  const { messages } = useI18n();
  const text = messages.content.pages.segments;
  const editorMessages = messages.content.editor;
  const common = messages.common;
  const { data: allPages = [] } = useContentPages();
  const saveSegments = useSaveContentPageSegments();
  const saveTarget = useSaveContentPage();

  const defaultPages = useMemo(
    () => allPages.filter((p: ContentPageSummary) => p.pageType === "default" && p.slug !== page.slug),
    [allPages, page.slug],
  );

  const [draft, setDraft] = useState<DraftSegment[]>(() => toDraft(page));
  const [error, setError] = useState<string | null>(null);
  const [activeTargetSlug, setActiveTargetSlug] = useState<string | null>(() => draft[0]?.targetSlug ?? null);
  const [targetDraftContent, setTargetDraftContent] = useState<string | null>(null);
  const [targetSaved, setTargetSaved] = useState(false);

  // Keep active selection valid when segments change.
  useEffect(() => {
    if (draft.length === 0) {
      if (activeTargetSlug !== null) setActiveTargetSlug(null);
      return;
    }
    if (!draft.some((s) => s.targetSlug === activeTargetSlug)) {
      setActiveTargetSlug(draft[0].targetSlug);
      setTargetDraftContent(null);
      setTargetSaved(false);
    }
  }, [draft, activeTargetSlug]);

  const { data: targetPage } = useAdminContentPage(activeTargetSlug ?? undefined);

  // Reset draft content on target change.
  useEffect(() => {
    setTargetDraftContent(null);
    setTargetSaved(false);
  }, []);

  useEffect(() => {
    if (!targetSaved) return;
    const t = setTimeout(() => setTargetSaved(false), 2000);
    return () => clearTimeout(t);
  }, [targetSaved]);

  function move(index: number, delta: number) {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= draft.length) return;
    const next = draft.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraft(next.map((s, i) => ({ ...s, position: i })));
  }

  function remove(index: number) {
    setDraft(draft.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })));
  }

  function update(index: number, patch: Partial<PageSegmentInput>) {
    setDraft(draft.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addSegment() {
    const targetSlug = defaultPages[0]?.slug;
    if (!targetSlug) return;
    setDraft([
      ...draft,
      {
        localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        position: draft.length,
        label: "",
        targetSlug,
      },
    ]);
  }

  const canSave = draft.every((s) => s.label.trim().length > 0 && s.targetSlug);

  async function handleSave() {
    setError(null);
    try {
      await saveSegments.mutateAsync({
        slug: page.slug,
        segments: draft.map((s, i) => ({ position: i, label: s.label, targetSlug: s.targetSlug })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : text.saveError);
    }
  }

  const currentContent = targetDraftContent ?? targetPage?.content ?? "";

  function handleTargetContentChange(next: string) {
    setTargetDraftContent(next);
    setTargetSaved(false);
  }

  function handleSaveTarget() {
    if (!targetPage || !activeTargetSlug) return;
    if (currentContent === targetPage.content) return;
    saveTarget.mutate(
      { slug: activeTargetSlug, data: { content: currentContent } },
      {
        onSuccess: () => {
          setTargetSaved(true);
          setTargetDraftContent(null);
        },
      },
    );
  }

  if (defaultPages.length === 0 && draft.length === 0) {
    return <div className="px-6 py-6 text-sm text-[var(--ds-text-muted)]">{text.noDefaultPages}</div>;
  }

  const previewSegments = draft.map((s) => ({
    key: s.targetSlug,
    label: s.label.trim() || text.labelPlaceholder,
  }));

  const targetDropdownOptions: DropdownOption<string>[] = defaultPages.map((p) => ({
    value: p.slug,
    label: `${p.title} (/${p.slug})`,
  }));

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <FormLabelText className="mb-0">{text.title}</FormLabelText>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={addSegment}
            disabled={defaultPages.length === 0}
            className="flex items-center gap-1.5 px-3 h-8 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-xs font-medium hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
            {text.addSegment}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saveSegments.isPending}
            className="flex items-center gap-1.5 px-3 h-8 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-xs font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-60"
          >
            {saveSegments.isPending ? text.saving : text.save}
          </button>
        </div>
      </header>

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
                <span className="text-[10px] font-mono text-[var(--ds-text-subtle)] w-6 text-right">{index + 1}.</span>
                <input
                  type="text"
                  value={segment.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                  placeholder={text.labelPlaceholder}
                  className="flex-1 min-w-[140px] h-7 px-2 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <div className="w-64">
                  <Dropdown
                    size="sm"
                    value={dropdownValue}
                    options={options}
                    onChange={(v) => update(index, { targetSlug: v })}
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
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {draft.length > 0 && activeTargetSlug && (
        <div className="flex flex-col gap-4 pt-4 border-t border-[var(--ds-border)]">
          <FormLabelText className="mb-0">{text.preview}</FormLabelText>
          <EmbossedSegmentedControl
            segments={previewSegments}
            value={activeTargetSlug}
            onChange={(next) => {
              // Unsaved target changes are silently dropped on switch —
              // user explicitly clicks a different tab. A native confirm
              // dialog here would conflict with the dashboard's policy
              // against window.confirm.
              setActiveTargetSlug(next);
              setTargetDraftContent(null);
              setTargetSaved(false);
            }}
          />

          <div className="flex items-center justify-between">
            <FormLabelText className="mb-0">
              {targetPage?.title ?? activeTargetSlug} (/{activeTargetSlug})
            </FormLabelText>
            <button
              type="button"
              onClick={handleSaveTarget}
              disabled={saveTarget.isPending || !targetPage || currentContent === targetPage.content}
              className="flex items-center gap-1.5 px-3 h-8 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-xs font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-60"
            >
              {saveTarget.isPending ? common.saving : targetSaved ? editorMessages.saved : common.save}
            </button>
          </div>

          <Suspense fallback={<div className="h-64 bg-[var(--ds-input-bg)] animate-pulse rounded-control" />}>
            {targetPage && (
              <MarkdownEditor
                key={activeTargetSlug}
                value={currentContent}
                onChange={handleTargetContentChange}
                height="420px"
                className="rounded-control border border-[var(--ds-border)]"
              />
            )}
          </Suspense>

          {saveTarget.isError && <p className="text-xs text-red-500">{editorMessages.saveError}</p>}
        </div>
      )}
    </div>
  );
}
