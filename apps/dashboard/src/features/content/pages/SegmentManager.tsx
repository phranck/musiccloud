import type { ContentPage, ContentPageSummary, PageSegmentInput } from "@musiccloud/shared";
import { ArrowDownIcon, ArrowUpIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { useI18n } from "@/context/I18nContext";
import {
  useContentPages,
  useSaveContentPageSegments,
} from "@/features/content/hooks/useAdminContent";

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
  const { data: allPages = [] } = useContentPages();
  const saveSegments = useSaveContentPageSegments();

  const defaultPages = useMemo(
    () => allPages.filter((p: ContentPageSummary) => p.pageType === "default" && p.slug !== page.slug),
    [allPages, page.slug],
  );

  const [draft, setDraft] = useState<DraftSegment[]>(() => toDraft(page));
  const [error, setError] = useState<string | null>(null);

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

  if (defaultPages.length === 0 && draft.length === 0) {
    return (
      <div className="px-6 py-6 text-sm text-[var(--ds-text-muted)]">{text.noDefaultPages}</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--ds-text)]">{text.title}</h2>
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
          {draft.map((segment, index) => (
            <li
              key={segment.localId}
              className="flex flex-wrap items-center gap-2 border border-[var(--ds-border)] rounded-control bg-[var(--ds-surface)] px-3 py-2"
            >
              <span className="text-[10px] font-mono text-[var(--ds-text-subtle)] w-6 text-right">
                {index + 1}.
              </span>
              <input
                type="text"
                value={segment.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder={text.labelPlaceholder}
                className="flex-1 min-w-[140px] px-2 py-1 text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded text-[var(--ds-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
              <select
                value={segment.targetSlug}
                onChange={(e) => update(index, { targetSlug: e.target.value })}
                className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-1 text-[var(--ds-text)] focus:outline-none cursor-pointer"
              >
                {/* allow keeping a target that has since been converted to segmented / deleted */}
                {!defaultPages.some((p) => p.slug === segment.targetSlug) && segment.targetSlug && (
                  <option value={segment.targetSlug}>/{segment.targetSlug}</option>
                )}
                {defaultPages.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title} (/{p.slug})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title={text.moveUp}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
                >
                  <ArrowUpIcon weight="duotone" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, +1)}
                  disabled={index === draft.length - 1}
                  title={text.moveDown}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--ds-surface-hover)] disabled:opacity-30"
                >
                  <ArrowDownIcon weight="duotone" className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  title={text.remove}
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--ds-btn-danger-text)] hover:bg-[var(--ds-btn-danger-hover-bg)]"
                >
                  <TrashIcon weight="duotone" className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft.length > 0 && (
        <div className="pt-3 border-t border-[var(--ds-border)]">
          <span className="block text-[10px] font-medium text-[var(--ds-text-subtle)] uppercase tracking-wide mb-2">
            {text.preview}
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-[var(--ds-surface-sunken)] rounded-control">
            {draft.map((s) => (
              <span
                key={s.localId}
                className="px-3 py-1 text-xs font-medium text-[var(--ds-text-muted)] rounded"
              >
                {s.label.trim() || text.labelPlaceholder}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
