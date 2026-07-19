import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { ContentContext, PageType } from "@musiccloud/shared";
import { FileDashedIcon, FileIcon, FileMdIcon, PencilLineIcon, PlusCircleIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useMemo, useReducer } from "react";
import { useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { Dialog, dialogHeaderIconClass } from "@/components/ui/Dialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { ColumnDef, DataTableRowProps } from "@/components/ui/Table";
import { DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import { groupPagesByHierarchy } from "@/features/content/hierarchy";
import {
  type ContentPageSummary,
  useContentPages,
  useDeleteContentPage,
} from "@/features/content/hooks/useAdminContent";
import { PageStatusBadge } from "@/features/content/PageStatus";
import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { SegmentsActionType } from "@/features/content/state/slices/segmentsSlice";
import { SidebarActionType } from "@/features/content/state/slices/sidebarSlice";
import { formatEnglishDate } from "@/lib/format";

const text = dashboardCopy.content.pages;
const common = dashboardCopy.common;

type ContentPage = ContentPageSummary;

interface HierarchicalPage extends ContentPage {
  depth: 0 | 1;
  /** Set on depth-1 children — names the segmented parent that owns this row. */
  parentSlug?: string;
}

function sortableIdFor(row: HierarchicalPage): string {
  if (row.depth === 1 && row.parentSlug) return `child:${row.parentSlug}:${row.slug}`;
  if (row.pageType === PageType.Segmented) return `top:${row.slug}`;
  return `orphan:${row.slug}`;
}

// Returns true if the active drag has been released past the bottom of the
// table (used to demote a child to orphan when no orphan drop-target exists).
const OUTSIDE_DROP_THRESHOLD_PX = 8;
const collisionDetection: CollisionDetection = (args) => {
  const { pointerCoordinates, droppableRects } = args;
  if (pointerCoordinates && droppableRects.size > 0) {
    let maxBottom = 0;
    for (const rect of droppableRects.values()) {
      const bottom = rect.top + rect.height;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    if (pointerCoordinates.y > maxBottom + OUTSIDE_DROP_THRESHOLD_PX) return [];
  }
  return closestCorners(args);
};

// Pointer-relative insert position: pointer above target's vertical center →
// insert BEFORE target; below → insert AFTER. The "intended" index is in the
// pre-removal coordinate space; same-list reorder must compensate when the
// source sits above the destination.
function intendedDropIndex(e: DragEndEvent, list: ReadonlyArray<{ targetSlug: string }>, overSlug: string): number {
  const insertAt = list.findIndex((s) => s.targetSlug === overSlug);
  if (insertAt < 0) return list.length;
  const activeRect = e.active.rect.current.translated;
  const overRect = e.over?.rect;
  if (!activeRect || !overRect) return insertAt;
  const activeCenter = activeRect.top + activeRect.height / 2;
  const overCenter = overRect.top + overRect.height / 2;
  return activeCenter > overCenter ? insertAt + 1 : insertAt;
}

function SortableHierarchicalRow({ row, className, children }: DataTableRowProps<HierarchicalPage>) {
  const id = sortableIdFor(row);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id });
  const { active, over } = useDndContext();
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  // Drop-target affordance differs by row kind and pointer position. Applied
  // to <td> children (not <tr>) because Safari does not render box-shadow on
  // <tr> in border-collapse tables — Chrome does, leading to a cross-browser
  // discrepancy where the indicator was invisible in Safari only.
  //   top:  → drop INTO this segmented parent (top+bottom rule + bg tint)
  //   peer + pointer in lower half → bottom line (insert AFTER this row)
  //   peer + pointer in upper half → top line   (insert BEFORE this row)
  // Direction matches `intendedDropIndex` in handleDragEnd: both compare the
  // active item's translated center against the over row's center.
  const isTopRow = id.startsWith("top:");
  const dropAfter =
    isOver && active?.rect.current.translated && over?.rect
      ? active.rect.current.translated.top + active.rect.current.translated.height / 2 >
        over.rect.top + over.rect.height / 2
      : false;
  const peerIndicator = dropAfter
    ? "[&>td]:shadow-[inset_0_-2px_0_0_var(--color-primary)]"
    : "[&>td]:shadow-[inset_0_2px_0_0_var(--color-primary)]";
  const overClass =
    isOver && !isDragging
      ? isTopRow
        ? "[&>td]:shadow-[inset_0_2px_0_0_var(--color-primary),inset_0_-2px_0_0_var(--color-primary)] bg-[var(--color-primary)]/10"
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

interface HierarchicalPagesTableProps {
  columns: ColumnDef<HierarchicalPage>[];
  pages: HierarchicalPage[];
  sortable?: boolean;
}

function HierarchicalPagesTable({ columns, pages, sortable = false }: HierarchicalPagesTableProps) {
  return (
    <DataTable
      columns={columns}
      data={pages}
      getRowKey={(page) => page.slug}
      stickyHeader
      RowComponent={sortable ? SortableHierarchicalRow : undefined}
    />
  );
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return formatEnglishDate(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface PagesListState {
  showCreate: boolean;
  deleteTarget: { slug: string; title: string } | null;
  contextFilter: "all" | "frontend" | "developer-portal";
}

const initialState: PagesListState = {
  showCreate: false,
  deleteTarget: null,
  contextFilter: "all",
};

function usePagesListPage() {
  const { data: pages = [], isLoading } = useContentPages();
  const deletePage = useDeleteContentPage();
  const navigate = useNavigate();
  const editor = usePagesEditor();

  const [state, dispatch] = useReducer(
    (prev: PagesListState, action: Partial<PagesListState>): PagesListState => ({ ...prev, ...action }),
    initialState,
  );
  const { showCreate, deleteTarget, contextFilter } = state;

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

  const visibleContextMask =
    contextFilter === "frontend"
      ? ContentContext.Frontend
      : contextFilter === "developer-portal"
        ? ContentContext.DeveloperPortal
        : null;

  // Apply optimistic order from sidebar/segments slices so dragged rows stay
  // in their dropped position until the user saves or discards. The Sidebar
  // component hydrates the slices on mount; PagesListPage just consumes.
  const hierarchicalPages = useMemo<HierarchicalPage[]>(() => {
    const { segmentedBlocks: rawBlocks, orphanDefaults } = groupPagesByHierarchy(pages);
    const orderedParents =
      editor.sidebar.current.length > 0
        ? editor.sidebar.current.reduce<typeof rawBlocks>((acc, slug) => {
            const block = rawBlocks.find((b) => b.parent.slug === slug);
            if (block) acc.push(block);
            return acc;
          }, [])
        : rawBlocks;
    const out: HierarchicalPage[] = [];
    for (const { parent, children } of orderedParents) {
      out.push({ ...parent, depth: 0 });
      const sliceCurrent = editor.segments.byOwner[parent.slug]?.current;
      const orderedChildren = sliceCurrent
        ? sliceCurrent.reduce<ContentPageSummary[]>((acc, entry) => {
            const child = bySlug.get(entry.targetSlug);
            if (child) acc.push(child);
            return acc;
          }, [])
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
    if (visibleContextMask === null) return out;
    const visibleSlugs = new Set<string>();
    for (const page of pages) {
      if ((page.contextMask & visibleContextMask) === visibleContextMask) visibleSlugs.add(page.slug);
    }
    const visibleRows: HierarchicalPage[] = [];
    for (const page of out) {
      if (!visibleSlugs.has(page.slug)) continue;
      visibleRows.push(
        page.depth === 1 && page.parentSlug && !visibleSlugs.has(page.parentSlug)
          ? { ...page, depth: 0 as const, parentSlug: undefined }
          : page,
      );
    }
    return visibleRows;
  }, [pages, editor.sidebar.current, editor.segments.byOwner, bySlug, visibleContextMask]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const activeId = String(active.id);

    // Outside-drop (pointer past the table's last row): demote child to orphan.
    // No visible drop target; user discovers this by dragging into empty space.
    if (!over) {
      if (activeId.startsWith("child:")) {
        const [, owner, target] = activeId.split(":");
        if (owner && target) editor.dispatch.segments({ type: SegmentsActionType.Remove, owner, target });
      }
      return;
    }
    if (active.id === over.id) return;
    const overId = String(over.id);
    const rawBlocks = groupPagesByHierarchy(pages).segmentedBlocks;

    if (activeId.startsWith("top:") && overId.startsWith("top:")) {
      const fromSlug = activeId.slice(4);
      const toSlug = overId.slice(4);
      const baseOrder = rawBlocks.map((b) => b.parent.slug);
      const order = editor.sidebar.current.length > 0 ? editor.sidebar.current : baseOrder;
      const from = order.indexOf(fromSlug);
      if (from < 0) return;
      const intended = intendedDropIndex(
        e,
        order.map((slug) => ({ targetSlug: slug })),
        toSlug,
      );
      const to = from < intended ? intended - 1 : intended;
      if (to < 0 || from === to) return;
      if (editor.sidebar.current.length === 0) {
        editor.dispatch.sidebar({ type: SidebarActionType.Hydrate, topLevelOrder: order });
      }
      editor.dispatch.sidebar({ type: SidebarActionType.ReorderTopLevel, from, to });
      return;
    }

    if (activeId.startsWith("child:") && overId.startsWith("child:")) {
      const [, fromOwner, target] = activeId.split(":");
      const [, toOwner, overTarget] = overId.split(":");
      if (!fromOwner || !target || !toOwner || !overTarget) return;
      if (fromOwner === toOwner) {
        const items = editor.segments.byOwner[fromOwner]?.current ?? [];
        const from = items.findIndex((s) => s.targetSlug === target);
        if (from < 0) return;
        const intended = intendedDropIndex(e, items, overTarget);
        const to = from < intended ? intended - 1 : intended;
        if (to < 0 || from === to) return;
        editor.dispatch.segments({ type: SegmentsActionType.Reorder, owner: fromOwner, from, to });
      } else {
        const targetList = editor.segments.byOwner[toOwner]?.current ?? [];
        editor.dispatch.segments({
          type: SegmentsActionType.Move,
          target,
          from: fromOwner,
          to: toOwner,
          position: intendedDropIndex(e, targetList, overTarget),
        });
      }
      return;
    }

    if (activeId.startsWith("child:") && overId.startsWith("orphan:")) {
      const [, owner, target] = activeId.split(":");
      if (!owner || !target) return;
      editor.dispatch.segments({ type: SegmentsActionType.Remove, owner, target });
      return;
    }

    if (activeId.startsWith("orphan:") && overId.startsWith("child:")) {
      const target = activeId.slice("orphan:".length);
      const [, toOwner, overTarget] = overId.split(":");
      if (!target || !toOwner || !overTarget) return;
      const list = editor.segments.byOwner[toOwner]?.current ?? [];
      const promoted = bySlug.get(target);
      editor.dispatch.segments({
        type: SegmentsActionType.Add,
        owner: toOwner,
        target,
        position: intendedDropIndex(e, list, overTarget),
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
        type: SegmentsActionType.Add,
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
        type: SegmentsActionType.Move,
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
          const Icon = page.pageType === PageType.Segmented ? FileDashedIcon : FileMdIcon;
          return (
            <div className="flex items-center gap-2" style={{ paddingLeft: page.depth * 24 }}>
              <Icon weight="duotone" className="size-4 shrink-0 text-[var(--ds-text-muted)]" />
              <button
                type="button"
                onClick={() => navigate(`/pages/${page.slug}`)}
                className="font-medium text-[var(--ds-text)] hover:underline text-left truncate"
              >
                {page.title}
              </button>
              <div className="flex flex-wrap gap-1">
                {(page.contextMask & ContentContext.Frontend) === ContentContext.Frontend && (
                  <span className="rounded-control bg-[var(--ds-surface-hover)] px-1.5 py-0.5 text-[0.625rem] font-medium text-[var(--ds-text-muted)]">
                    {text.contexts.frontend}
                  </span>
                )}
                {(page.contextMask & ContentContext.DeveloperPortal) === ContentContext.DeveloperPortal && (
                  <span className="rounded-control bg-[var(--ds-surface-hover)] px-1.5 py-0.5 text-[0.625rem] font-medium text-[var(--ds-text-muted)]">
                    {text.contexts.developerPortal}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "slug",
        header: text.table.slug,
        cell: (page) => (
          <div className="flex flex-col gap-1">
            {page.publications.map((publication) => (
              <span key={publication.context} className="flex items-center gap-1.5 text-xs text-[var(--ds-text-muted)]">
                <span
                  className="min-w-6 font-medium"
                  title={
                    publication.context === ContentContext.Frontend
                      ? text.contexts.frontend
                      : text.contexts.developerPortal
                  }
                >
                  {publication.context === ContentContext.Frontend ? "F" : "DP"}
                </span>
                <span className="font-mono">{publication.path}</span>
              </span>
            ))}
          </div>
        ),
      },
      {
        id: "type",
        header: text.table.type,
        cell: (page) => (
          <span className="text-xs text-[var(--ds-text-muted)]">
            {page.pageType === PageType.Segmented ? text.pageTypeSegmented : text.pageTypeDefault}
          </span>
        ),
      },
      {
        id: "status",
        header: text.table.status,
        cell: (page) => (
          <div className="flex flex-col items-start gap-1">
            {page.publications.map((publication) => (
              <span key={publication.context} className="flex items-center gap-1.5">
                <span
                  className="min-w-6 text-xs font-medium text-[var(--ds-text-muted)]"
                  title={
                    publication.context === ContentContext.Frontend
                      ? text.contexts.frontend
                      : text.contexts.developerPortal
                  }
                >
                  {publication.context === ContentContext.Frontend ? "F" : "DP"}
                </span>
                <PageStatusBadge status={publication.status} />
              </span>
            ))}
          </div>
        ),
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
        cell: (page) => <span className="text-xs text-[var(--ds-text-muted)]">{formatDate(page.updatedAt)}</span>,
      },
      {
        id: "actions",
        className: "w-48",
        cell: (page) => (
          <div className="flex gap-2 justify-end">
            <TableActionButton
              onClick={() => navigate(`/pages/${page.slug}`)}
              icon={<PencilLineIcon weight="duotone" className="size-3.5" />}
              label={common.edit}
            />
            <TableActionButton
              variant={DashboardButtonVariant.Danger}
              onClick={() => handleDeleteRequest(page.slug, page.title)}
              disabled={deletePage.isPending}
              icon={<TrashIcon weight="duotone" className="size-3.5" />}
              label={common.delete}
            />
          </div>
        ),
      },
    ],
    [navigate, deletePage.isPending, handleDeleteRequest],
  );

  return (
    <PageLayout>
      <PageHeader title={text.title}>
        {!showCreate && (
          <DashboardActionButton
            action={DashboardActionId.Create}
            icon={<PlusCircleIcon weight="duotone" className="size-3.5" />}
            label={text.newPage}
            onClick={() => dispatch({ showCreate: true })}
            size="control"
            type="button"
          />
        )}
      </PageHeader>

      <PageBody>
        <div className="flex items-center justify-between gap-3 pb-3">
          <span className="text-xs font-semibold text-[var(--ds-text-subtle)] uppercase tracking-wider">
            {text.contexts.label}
          </span>
          <SegmentedControl
            value={contextFilter}
            options={[
              { value: "all", label: text.contexts.all },
              { value: "frontend", label: text.contexts.frontend },
              { value: "developer-portal", label: text.contexts.developerPortal },
            ]}
            onChange={(value) => dispatch({ contextFilter: value })}
          />
        </div>
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

        {!isLoading && pages.length > 0 && hierarchicalPages.length === 0 && (
          <ContentUnavailableView
            className="flex-1 min-h-0"
            icon={<FileIcon weight="duotone" aria-hidden />}
            title={text.emptyPages}
            subtitle={text.emptyPagesHint}
          />
        )}

        {!isLoading && hierarchicalPages.length > 0 && (
          <div className="-mx-3">
            {contextFilter === "all" ? (
              <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
                <SortableContext items={hierarchicalPages.map(sortableIdFor)} strategy={() => null}>
                  <HierarchicalPagesTable columns={columns} pages={hierarchicalPages} sortable />
                </SortableContext>
              </DndContext>
            ) : (
              <HierarchicalPagesTable columns={columns} pages={hierarchicalPages} />
            )}
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
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            disabled={deletePage.isPending}
            icon={false}
            label={common.cancel}
            onClick={() => dispatch({ deleteTarget: null })}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
          <DashboardActionButton
            action={DashboardActionId.Delete}
            busyLabel="…"
            icon={false}
            label={common.delete}
            onClick={handleDeleteConfirm}
            status={deletePage.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </PageLayout>
  );
}

export function PagesListPage() {
  return usePagesListPage();
}
