import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DEFAULT_LOCALE, LOCALES, type Locale, type TranslationStatus } from "@musiccloud/shared";
import type { Icon } from "@phosphor-icons/react";
import {
  CheckCircleIcon,
  FileDashedIcon,
  FileIcon,
  FileMdIcon,
  PencilLineIcon,
  PencilSimpleIcon,
  PlusCircleIcon,
  QuestionIcon,
  TrashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import type { ColumnDef, DataTableRowProps } from "@/components/ui/Table";
import { DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import { groupPagesByHierarchy } from "@/features/content/hierarchy";
import {
  type ContentPageSummary,
  useContentPages,
  useDeleteContentPage,
} from "@/features/content/hooks/useAdminContent";
import { PageStatusBadge } from "@/features/content/PageStatus";
import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";

const TRANSLATION_ICON: Record<TranslationStatus, Icon> = {
  ready: CheckCircleIcon,
  stale: WarningIcon,
  draft: PencilSimpleIcon,
  missing: QuestionIcon,
};

const TRANSLATION_COLOR: Record<TranslationStatus, string> = {
  ready: "text-emerald-500",
  stale: "text-amber-500",
  draft: "text-[var(--ds-text-muted)]",
  missing: "text-[var(--ds-text-muted)] opacity-60",
};

type ContentPage = ContentPageSummary;

interface HierarchicalPage extends ContentPage {
  depth: 0 | 1;
  /** Set on depth-1 children — names the segmented parent that owns this row. */
  parentSlug?: string;
}

function sortableIdFor(row: HierarchicalPage): string {
  if (row.depth === 1 && row.parentSlug) return `child:${row.parentSlug}:${row.slug}`;
  if (row.pageType === "segmented") return `top:${row.slug}`;
  return `orphan:${row.slug}`;
}

function SortableHierarchicalRow({ row, className, children }: DataTableRowProps<HierarchicalPage>) {
  const id = sortableIdFor(row);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, index, activeIndex } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // Drop-target affordance differs by row kind and drag direction:
  //   top:  → drop INTO this segmented parent (full ring + faint bg tint)
  //   peer + drag-down (active was above this row) → bottom line (insert AFTER this row)
  //   peer + drag-up   (active was below this row) → top line (insert BEFORE this row)
  const isTopRow = id.startsWith("top:");
  const draggingDown = activeIndex !== -1 && activeIndex < index;
  const peerIndicator = draggingDown
    ? "shadow-[inset_0_-2px_0_0_var(--color-primary)]"
    : "shadow-[inset_0_2px_0_0_var(--color-primary)]";
  const overClass =
    isOver && !isDragging
      ? isTopRow
        ? "ring-2 ring-inset ring-[var(--color-primary)] bg-[var(--color-primary)]/10"
        : peerIndicator
      : "";
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`table-row-hover cursor-grab active:cursor-grabbing select-none ${className ?? ""} ${overClass}`.trim()}
      {...attributes}
      {...listeners}
    >
      {children}
    </tr>
  );
}

function formatDate(isoDate: string | null, locale: string): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface PagesListState {
  showCreate: boolean;
  deleteTarget: { slug: string; title: string } | null;
}

const initialState: PagesListState = {
  showCreate: false,
  deleteTarget: null,
};

export function PagesListPage() {
  const { locale, messages } = useI18n();
  const text = messages.content.pages;
  const common = messages.common;
  const { data: pages = [], isLoading } = useContentPages();
  const deletePage = useDeleteContentPage();
  const navigate = useNavigate();
  const editor = usePagesEditor();

  const [state, dispatch] = useReducer(
    (prev: PagesListState, action: Partial<PagesListState>): PagesListState => ({ ...prev, ...action }),
    initialState,
  );
  const { showCreate, deleteTarget } = state;

  const handleDeleteRequest = useCallback((pageSlug: string, pageTitle: string) => {
    dispatch({ deleteTarget: { slug: pageSlug, title: pageTitle } });
  }, []);

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deletePage.mutate(deleteTarget.slug, {
      onSuccess: () => dispatch({ deleteTarget: null }),
    });
  }

  const bySlug = useMemo(() => {
    const m = new Map<string, ContentPageSummary>();
    for (const p of pages) m.set(p.slug, p);
    return m;
  }, [pages]);

  // Apply optimistic order from sidebar/segments slices so dragged rows stay
  // in their dropped position until the user saves or discards. The Sidebar
  // component hydrates the slices on mount; PagesListPage just consumes.
  const hierarchicalPages = useMemo<HierarchicalPage[]>(() => {
    const { segmentedBlocks: rawBlocks, orphanDefaults } = groupPagesByHierarchy(pages);
    const orderedParents =
      editor.sidebar.current.length > 0
        ? editor.sidebar.current
            .map((slug) => rawBlocks.find((b) => b.parent.slug === slug))
            .filter((b): b is (typeof rawBlocks)[number] => b !== undefined)
        : rawBlocks;
    const out: HierarchicalPage[] = [];
    for (const { parent, children } of orderedParents) {
      out.push({ ...parent, depth: 0 });
      const sliceCurrent = editor.segments.byOwner[parent.slug]?.current;
      const orderedChildren = sliceCurrent
        ? sliceCurrent
            .map((entry) => bySlug.get(entry.targetSlug))
            .filter((c): c is ContentPageSummary => c !== undefined)
        : children;
      for (const child of orderedChildren) {
        out.push({ ...child, depth: 1, parentSlug: parent.slug });
      }
    }
    for (const orphan of orphanDefaults) {
      // After demote, the slice removed the row from its parent but the
      // server-side pages list still groups it under that parent until the
      // next refetch. Skip rows that the slice has already promoted/demoted
      // to keep the rendered hierarchy consistent with optimistic state.
      if (out.some((r) => r.slug === orphan.slug)) continue;
      out.push({ ...orphan, depth: 0 });
    }
    return out;
  }, [pages, editor.sidebar.current, editor.segments.byOwner, bySlug]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const rawBlocks = groupPagesByHierarchy(pages).segmentedBlocks;

    if (activeId.startsWith("top:") && overId.startsWith("top:")) {
      const fromSlug = activeId.slice(4);
      const toSlug = overId.slice(4);
      const baseOrder = rawBlocks.map((b) => b.parent.slug);
      const order = editor.sidebar.current.length > 0 ? editor.sidebar.current : baseOrder;
      const from = order.indexOf(fromSlug);
      const to = order.indexOf(toSlug);
      if (from < 0 || to < 0) return;
      if (editor.sidebar.current.length === 0) {
        editor.dispatch.sidebar({ type: "hydrate", topLevelOrder: order });
      }
      editor.dispatch.sidebar({ type: "reorder-top-level", from, to });
      return;
    }

    if (activeId.startsWith("child:") && overId.startsWith("child:")) {
      const [, fromOwner, target] = activeId.split(":");
      const [, toOwner, overTarget] = overId.split(":");
      if (!fromOwner || !target || !toOwner || !overTarget) return;
      if (fromOwner === toOwner) {
        const items = editor.segments.byOwner[fromOwner]?.current ?? [];
        const from = items.findIndex((s) => s.targetSlug === target);
        const to = items.findIndex((s) => s.targetSlug === overTarget);
        if (from < 0 || to < 0) return;
        editor.dispatch.segments({ type: "reorder", owner: fromOwner, from, to });
      } else {
        const targetList = editor.segments.byOwner[toOwner]?.current ?? [];
        const insertAt = targetList.findIndex((s) => s.targetSlug === overTarget);
        editor.dispatch.segments({
          type: "move",
          target,
          from: fromOwner,
          to: toOwner,
          position: insertAt < 0 ? targetList.length : insertAt,
        });
      }
      return;
    }

    if (activeId.startsWith("child:") && overId.startsWith("orphan:")) {
      const [, owner, target] = activeId.split(":");
      if (!owner || !target) return;
      editor.dispatch.segments({ type: "remove", owner, target });
      return;
    }

    if (activeId.startsWith("orphan:") && overId.startsWith("child:")) {
      const target = activeId.slice("orphan:".length);
      const [, toOwner, overTarget] = overId.split(":");
      if (!target || !toOwner || !overTarget) return;
      const list = editor.segments.byOwner[toOwner]?.current ?? [];
      const insertAt = list.findIndex((s) => s.targetSlug === overTarget);
      const promoted = bySlug.get(target);
      editor.dispatch.segments({
        type: "add",
        owner: toOwner,
        target,
        position: insertAt < 0 ? list.length : insertAt,
        label: promoted?.title ?? target,
      });
      return;
    }

    // Drop a default page onto a segmented parent row → make it a child of
    // that parent (appended to the end). Lets users seed an empty segmented
    // page without first having to drop onto an existing child.
    if (activeId.startsWith("orphan:") && overId.startsWith("top:")) {
      const target = activeId.slice("orphan:".length);
      const toOwner = overId.slice("top:".length);
      if (!target || !toOwner) return;
      const list = editor.segments.byOwner[toOwner]?.current ?? [];
      const promoted = bySlug.get(target);
      editor.dispatch.segments({
        type: "add",
        owner: toOwner,
        target,
        position: list.length,
        label: promoted?.title ?? target,
      });
      return;
    }

    // Drop an existing child onto another segmented parent row → cross-parent
    // move (appended). Same-owner drops collapse to a no-op.
    if (activeId.startsWith("child:") && overId.startsWith("top:")) {
      const [, fromOwner, target] = activeId.split(":");
      const toOwner = overId.slice("top:".length);
      if (!fromOwner || !target || !toOwner) return;
      if (fromOwner === toOwner) return;
      const targetList = editor.segments.byOwner[toOwner]?.current ?? [];
      editor.dispatch.segments({
        type: "move",
        target,
        from: fromOwner,
        to: toOwner,
        position: targetList.length,
      });
      return;
    }
    // orphan↔orphan: visual-only (orphan position not persisted).
  }

  const columns = useMemo<ColumnDef<HierarchicalPage>[]>(
    () => [
      {
        id: "title",
        header: text.table.title,
        cell: (page) => {
          const Icon = page.pageType === "segmented" ? FileDashedIcon : FileMdIcon;
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: page.depth * 24 }}>
              <Icon weight="duotone" className="w-4 h-4 shrink-0 text-[var(--ds-text-muted)]" />
              <button
                type="button"
                onClick={() => navigate(`/pages/${page.slug}`)}
                className="font-medium text-[var(--ds-text)] hover:underline text-left truncate"
              >
                {page.title}
              </button>
            </div>
          );
        },
      },
      {
        id: "slug",
        header: text.table.slug,
        cell: (page) => <span className="font-mono text-xs text-[var(--ds-text-muted)]">/{page.slug}</span>,
      },
      {
        id: "type",
        header: text.table.type,
        cell: (page) => (
          <span className="text-xs text-[var(--ds-text-muted)]">
            {page.pageType === "segmented" ? text.pageTypeSegmented : text.pageTypeDefault}
          </span>
        ),
      },
      {
        id: "status",
        header: text.table.status,
        cell: (page) => <PageStatusBadge status={page.status} />,
      },
      {
        id: "createdBy",
        header: text.table.createdBy,
        cell: (page) => <span className="text-xs text-[var(--ds-text-muted)]">{page.createdByUsername ?? "—"}</span>,
      },
      {
        id: "updatedAt",
        header: text.table.updatedAt,
        sortKey: (page) => page.updatedAt ?? "",
        cell: (page) => (
          <span className="text-xs text-[var(--ds-text-muted)]">{formatDate(page.updatedAt, locale)}</span>
        ),
      },
      {
        id: "translations",
        header: text.table.translations,
        cell: (page) => (
          <div className="flex gap-1.5 flex-wrap">
            {LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE).map((locale) => {
              const s: TranslationStatus = page.translationStatus?.[locale] ?? "missing";
              const StatusIcon = TRANSLATION_ICON[s];
              return (
                <span
                  key={locale}
                  title={`${locale.toUpperCase()}: ${s}`}
                  className="inline-flex items-center gap-1 text-xs font-mono"
                >
                  <span>{locale.toUpperCase()}</span>
                  <StatusIcon size={14} weight="duotone" className={TRANSLATION_COLOR[s]} />
                </span>
              );
            })}
          </div>
        ),
      },
      {
        id: "actions",
        className: "w-48",
        cell: (page) => (
          <div className="flex gap-2 justify-end">
            <TableActionButton
              onClick={() => navigate(`/pages/${page.slug}`)}
              icon={<PencilLineIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.edit}
            />
            <TableActionButton
              variant="danger"
              onClick={() => handleDeleteRequest(page.slug, page.title)}
              disabled={deletePage.isPending}
              icon={<TrashIcon weight="duotone" className="w-3.5 h-3.5" />}
              label={common.delete}
            />
          </div>
        ),
      },
    ],
    [text, common, locale, navigate, deletePage.isPending, handleDeleteRequest],
  );

  return (
    <PageLayout>
      <PageHeader title={text.title}>
        {!showCreate && (
          <button
            type="button"
            onClick={() => dispatch({ showCreate: true })}
            className="flex items-center gap-2 py-1.5 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)]"
          >
            <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
            {text.newPage}
          </button>
        )}
      </PageHeader>

      <PageBody>
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--ds-text-muted)] text-sm">
            {text.loadPages}
          </div>
        )}

        {!isLoading && pages.length === 0 && (
          <ContentUnavailableView
            className="flex-1 min-h-0"
            icon={<FileIcon weight="duotone" aria-hidden />}
            title={text.emptyPages}
            subtitle={text.emptyPagesHint}
          />
        )}

        {!isLoading && pages.length > 0 && (
          <div className="-mx-3 -mt-3">
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
              <SortableContext items={hierarchicalPages.map(sortableIdFor)} strategy={verticalListSortingStrategy}>
                <DataTable
                  columns={columns}
                  data={hierarchicalPages}
                  getRowKey={(page) => page.slug}
                  stickyHeader
                  RowComponent={SortableHierarchicalRow}
                />
              </SortableContext>
            </DndContext>
          </div>
        )}
      </PageBody>

      <CreatePageDialog
        open={showCreate}
        onClose={() => dispatch({ showCreate: false })}
        onCreated={(page) => navigate(`/pages/${page.slug}`)}
      />

      <Dialog
        open={deleteTarget !== null}
        title={text.deletePageTitle}
        titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
        onClose={() => dispatch({ deleteTarget: null })}
      >
        <div className="p-6 text-sm text-[var(--ds-text)]">
          {text.confirmDeletePrefix} „<span className="font-bold">{deleteTarget?.title}</span>“{" "}
          {text.confirmDeleteSuffix}
        </div>
        <Dialog.Footer>
          <button
            type="button"
            className={dialogBtnSecondary}
            onClick={() => dispatch({ deleteTarget: null })}
            disabled={deletePage.isPending}
          >
            {common.cancel}
          </button>
          <button
            type="button"
            className={dialogBtnDestructive}
            onClick={handleDeleteConfirm}
            disabled={deletePage.isPending}
          >
            {deletePage.isPending ? "…" : common.delete}
          </button>
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}
