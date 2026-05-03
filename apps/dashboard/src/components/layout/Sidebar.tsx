import {
  closestCenter,
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
import type { ContentPageSummary } from "@musiccloud/shared";
import {
  CaretCircleDoubleDownIcon,
  CaretCircleDoubleUpIcon,
  CaretDownIcon,
  ChartBarIcon,
  CopyIcon,
  EnvelopeOpenIcon,
  FileDashedIcon,
  FileMdIcon,
  FilesIcon,
  GearIcon,
  HouseSimpleIcon,
  ListIcon,
  MarkdownLogoIcon,
  MicrophoneStageIcon,
  MusicNotesIcon,
  NotebookIcon,
  PlugsConnectedIcon,
  PlusCircleIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";

import { CollapsibleSidebarGroup, sidebarGroupItemClass } from "@/components/layout/CollapsibleSidebarGroup";
import { SidebarFooter } from "@/components/layout/SidebarFooter";
import { SidebarHeader } from "@/components/layout/SidebarHeader";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { groupPagesByHierarchy } from "@/features/content/hierarchy";
import { useContentPages } from "@/features/content/hooks/useAdminContent";
import { PageStatusIcon } from "@/features/content/PageStatus";
import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
import { isContentDirty } from "@/features/content/state/slices/contentSlice";
import { isMetaDirty } from "@/features/content/state/slices/metaSlice";
import { useAdminStats } from "@/features/overview/hooks/useAdminStats";
import { useCreateEmailTemplate, useEmailTemplates } from "@/features/templates/hooks/useEmailTemplates";
import type { AdminRole } from "@/shared/types/admin";

const ROLE_RANK: Record<AdminRole, number> = { owner: 2, admin: 1, moderator: 0 };
const SIDEBAR_GROUP_STORAGE_KEYS = [
  "sidebar-pages-open",
  "sidebar-forms-open",
  "sidebar-email-templates-open",
] as const;

interface SidebarProps {
  username?: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role?: AdminRole;
  onLogout: () => void;
  onItemClick?: () => void;
  onEditProfile?: () => void;
  bare?: boolean;
}

type TreeDepth = 1 | 2;
const TREE_VERT_X: Record<TreeDepth, number> = { 1: 20, 2: 48 };
const TREE_ROW_PADDING: Record<TreeDepth, number> = { 1: 28, 2: 56 };
const TREE_STUB_W = 18;
const TREE_TOP_EXTRA = 28;

interface PageTreeRowProps {
  depth: TreeDepth;
  ancestorContinues: TreeDepth[];
  isFirstChild?: boolean;
  isFirstAtTopLevel?: boolean;
  to: string;
  end?: boolean;
  onItemClick?: () => void;
  collapsible?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  toggleAriaLabel?: string;
  children: ReactNode;
}

function PageTreeRow({
  depth,
  ancestorContinues,
  isFirstChild,
  isFirstAtTopLevel,
  to,
  end,
  onItemClick,
  collapsible,
  expanded,
  onToggleExpanded,
  toggleAriaLabel,
  children,
}: PageTreeRowProps) {
  const vertX = TREE_VERT_X[depth];
  let incomingTop: number | string = "-50%";
  let incomingHeight: number | string = "100%";
  if (isFirstAtTopLevel) {
    incomingTop = -TREE_TOP_EXTRA;
    incomingHeight = `calc(50% + ${TREE_TOP_EXTRA}px)`;
  } else if (isFirstChild) {
    incomingTop = -12;
    incomingHeight = "calc(50% + 12px)";
  }
  return (
    <div className="relative" style={{ paddingLeft: TREE_ROW_PADDING[depth] }}>
      {ancestorContinues.map((d) => (
        <span
          key={d}
          aria-hidden
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-[var(--ds-border)]"
          style={{ left: TREE_VERT_X[d] - 1 }}
        />
      ))}
      <span
        aria-hidden
        className="pointer-events-none absolute w-0.5 bg-[var(--ds-border)]"
        style={{ left: vertX - 1, top: incomingTop, height: incomingHeight }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute h-0.5 bg-[var(--ds-border)]"
        style={{ left: vertX - 1, top: "50%", width: TREE_STUB_W, marginTop: -1 }}
      />
      <NavLink
        to={to}
        end={end}
        onClick={onItemClick}
        className={(state) => `${sidebarGroupItemClass(state)} ${collapsible ? "pr-8" : ""}`}
      >
        {children}
      </NavLink>
      {collapsible && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={toggleAriaLabel}
          aria-expanded={expanded}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-nav-hover-bg)]"
        >
          <CaretDownIcon
            weight="duotone"
            className={`w-3.5 h-3.5 transition-transform duration-200 ease-out ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

function PageTreeContent({ page, icon }: { page: { slug: string; title: string; status: string }; icon: ReactNode }) {
  const editor = usePagesEditor();
  const dirty = isMetaDirty(editor.meta, page.slug) || isContentDirty(editor.content, page.slug);
  return (
    <>
      {icon}
      <PageStatusIcon status={page.status} />
      <span className="flex flex-col min-w-0">
        <span className="truncate">{page.title}</span>
        <span className="truncate text-xs opacity-50">/{page.slug}</span>
      </span>
      {dirty && (
        <span
          role="img"
          aria-label="ungespeichert"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"
        />
      )}
    </>
  );
}

interface SortableChildRowProps {
  parentSlug: string;
  child: ContentPageSummary;
  isFirstChild: boolean;
  childrenContinue: boolean;
  onItemClick?: () => void;
}

function SortableChildRow({ parentSlug, child, isFirstChild, childrenContinue, onItemClick }: SortableChildRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `child:${parentSlug}:${child.slug}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing touch-none ${
        isOver && !isDragging ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""
      }`}
    >
      <PageTreeRow
        depth={2}
        ancestorContinues={childrenContinue ? [1] : []}
        isFirstChild={isFirstChild}
        to={`/pages/${child.slug}`}
        onItemClick={onItemClick}
      >
        <PageTreeContent page={child} icon={<FileMdIcon weight="duotone" className="w-4 h-4 shrink-0 opacity-70" />} />
      </PageTreeRow>
    </div>
  );
}

interface SortableOrphanRowProps {
  page: ContentPageSummary;
  onItemClick?: () => void;
}

function SortableOrphanRow({ page, onItemClick }: SortableOrphanRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `orphan:${page.slug}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing touch-none ${
        isOver && !isDragging ? "ring-2 ring-inset ring-[var(--color-primary)]" : ""
      }`}
    >
      <PageTreeRow depth={1} ancestorContinues={[]} to={`/pages/${page.slug}`} onItemClick={onItemClick}>
        <PageTreeContent page={page} icon={<FileMdIcon weight="duotone" className="w-4 h-4 shrink-0 opacity-70" />} />
      </PageTreeRow>
    </div>
  );
}

interface SortableTopLevelRowProps {
  parent: ContentPageSummary;
  childPages: ContentPageSummary[];
  bySlug: Map<string, ContentPageSummary>;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
  expandLabel: string;
  onItemClick?: () => void;
  childrenContinue: boolean;
}

function SortableTopLevelRow({
  parent,
  childPages,
  bySlug,
  collapsible,
  expanded,
  onToggle,
  expandLabel,
  onItemClick,
  childrenContinue,
}: SortableTopLevelRowProps) {
  const editor = usePagesEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `top:${parent.slug}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const overClass = isOver && !isDragging ? "ring-2 ring-inset ring-[var(--color-primary)]" : "";
  // Optimistic order: the segmentsSlice owns the source of truth once hydrated;
  // before hydrate (or for unknown owners) fall back to the server-side
  // childPages prop.
  const sliceCurrent = editor.segments.byOwner[parent.slug]?.current;
  const orderedChildren = sliceCurrent
    ? sliceCurrent.map((entry) => bySlug.get(entry.targetSlug)).filter((c): c is ContentPageSummary => c !== undefined)
    : childPages;
  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} className={`cursor-grab active:cursor-grabbing touch-none ${overClass}`}>
        <PageTreeRow
          depth={1}
          ancestorContinues={[]}
          to={`/pages/${parent.slug}`}
          onItemClick={onItemClick}
          collapsible={collapsible}
          expanded={expanded}
          onToggleExpanded={onToggle}
          toggleAriaLabel={expandLabel}
        >
          <PageTreeContent
            page={parent}
            icon={<FileDashedIcon weight="duotone" className="w-4 h-4 shrink-0 opacity-70" />}
          />
        </PageTreeRow>
      </div>
      {expanded && orderedChildren.length > 0 && (
        <SortableContext
          items={orderedChildren.map((c) => `child:${parent.slug}:${c.slug}`)}
          strategy={verticalListSortingStrategy}
        >
          {orderedChildren.map((child, idx) => (
            <SortableChildRow
              key={child.slug}
              parentSlug={parent.slug}
              child={child}
              isFirstChild={idx === 0}
              childrenContinue={childrenContinue}
              onItemClick={onItemClick}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

function PagesGroup({
  onItemClick,
  globalOpenState,
  globalOpenVersion,
  onOpenChange,
}: {
  onItemClick?: () => void;
  globalOpenState?: boolean | null;
  globalOpenVersion?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const { messages } = useI18n();
  const s = messages.layout.sidebar;
  const text = messages.content.pages;
  const { data: pages } = useContentPages();
  const editor = usePagesEditor();
  const navigate = useNavigate();
  const editorMatch = useMatch("/pages/:slug");
  const currentSlug = editorMatch?.params.slug;
  const [showCreate, setShowCreate] = useState(false);

  const list = pages ?? [];
  const { segmentedBlocks: rawSegmentedBlocks, orphanDefaults } = groupPagesByHierarchy(list);

  const bySlug = useMemo(() => {
    const m = new Map<string, ContentPageSummary>();
    for (const p of list) m.set(p.slug, p);
    return m;
  }, [list]);

  // If the user is sitting on a sub-page, "neue Seite" should land at the same
  // hierarchy level — i.e. as another sub-page of the current parent. Detect
  // that by walking the segmented blocks and looking for the active slug as a
  // child entry. For top-level pages (segmented parents, orphans) or the
  // overview, parentSlug stays undefined → new page becomes a top-level orphan.
  const parentSlug = useMemo<string | undefined>(() => {
    if (!currentSlug) return undefined;
    for (const block of rawSegmentedBlocks) {
      if (block.children.some((c) => c.slug === currentSlug)) return block.parent.slug;
    }
    return undefined;
  }, [currentSlug, rawSegmentedBlocks]);

  // Apply optimistic order from sidebarSlice when the user has dragged but not
  // saved yet. After save, useGlobalPagesSave re-hydrates the slice with the
  // new server order, so the slice and the (refetched) list stay aligned.
  const segmentedBlocks =
    editor.sidebar.current.length > 0
      ? editor.sidebar.current
          .map((slug) => rawSegmentedBlocks.find((b) => b.parent.slug === slug))
          .filter((b): b is (typeof rawSegmentedBlocks)[number] => b !== undefined)
      : rawSegmentedBlocks;

  // Hydrate the segments slice once we have data for all segmented owners.
  // Without this, drag-end dispatches against an empty byOwner are no-ops.
  // Re-hydrate would clobber in-flight edits, so we only fire on first fill.
  const segmentsHydratedRef = useRef(false);
  useEffect(() => {
    if (segmentsHydratedRef.current) return;
    if (rawSegmentedBlocks.length === 0) return;
    segmentsHydratedRef.current = true;
    editor.dispatch.segments({
      type: "hydrate",
      entries: rawSegmentedBlocks.map(({ parent }) => ({
        ownerSlug: parent.slug,
        segments: (parent.segments ?? []).map((seg) => ({
          position: seg.position,
          label: seg.label,
          targetSlug: seg.targetSlug,
        })),
      })),
    });
  }, [rawSegmentedBlocks, editor.dispatch]);

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const segmentedSlugsKey = segmentedBlocks.map(({ parent }) => parent.slug).join(",");
  useEffect(() => {
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const slug of segmentedSlugsKey ? segmentedSlugsKey.split(",") : []) {
        if (slug in prev) {
          next[slug] = prev[slug];
        } else {
          const stored = localStorage.getItem(`sidebar-page-children-${slug}-open`);
          next[slug] = stored === null ? true : stored === "true";
        }
      }
      return next;
    });
  }, [segmentedSlugsKey]);
  function toggleExpanded(slug: string) {
    setExpandedMap((prev) => {
      const next = { ...prev, [slug]: !(prev[slug] ?? true) };
      localStorage.setItem(`sidebar-page-children-${slug}-open`, String(next[slug]));
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("top:") && overId.startsWith("top:")) {
      const fromSlug = activeId.slice(4);
      const toSlug = overId.slice(4);
      const baseOrder = rawSegmentedBlocks.map((b) => b.parent.slug);
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

    // child → orphan = demote (server-side: child gets dropped from segments
    // and re-emerges as an orphan default on next refetch).
    if (activeId.startsWith("child:") && overId.startsWith("orphan:")) {
      const [, owner, target] = activeId.split(":");
      if (!owner || !target) return;
      editor.dispatch.segments({ type: "remove", owner, target });
      return;
    }

    // orphan → child = promote (the orphan becomes a sub-page of the target
    // owner; insert position derived from the over child's slot).
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

    // orphan → orphan: purely visual reorder; orphan order is not persisted
    // (only segmented parents have a position column). Skip dispatch.
  }

  function handleCreated(page: { slug: string; title: string }) {
    if (parentSlug) {
      // Insert the new page as the last child of the current parent.
      const siblings = editor.segments.byOwner[parentSlug]?.current ?? [];
      editor.dispatch.segments({
        type: "add",
        owner: parentSlug,
        target: page.slug,
        position: siblings.length,
        label: page.title,
      });
    }
    navigate(`/pages/${page.slug}`);
  }

  return (
    <>
      <CollapsibleSidebarGroup
        routeMatch="/pages/*"
        storageKey="sidebar-pages-open"
        icon={<FilesIcon weight="duotone" className="w-4 h-4" />}
        label={s.pages}
        badge={list.length}
        globalOpenState={globalOpenState}
        globalOpenVersion={globalOpenVersion}
        onOpenChange={onOpenChange}
        noRail
        trailingAction={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            aria-label={text.newPage}
            title={text.newPage}
            className="p-1.5 rounded text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] hover:bg-[var(--ds-nav-hover-bg)]"
          >
            <PlusCircleIcon weight="duotone" className="w-4 h-4" />
          </button>
        }
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <PageTreeRow
            key="__overview"
            depth={1}
            ancestorContinues={[]}
            isFirstAtTopLevel
            to="/pages"
            end
            onItemClick={onItemClick}
          >
            <span className="truncate">{s.pagesOverview}</span>
          </PageTreeRow>
          <SortableContext
            items={segmentedBlocks.map(({ parent }) => `top:${parent.slug}`)}
            strategy={verticalListSortingStrategy}
          >
            {segmentedBlocks.map(({ parent, children }, blockIdx) => {
              const childrenContinue = blockIdx < segmentedBlocks.length - 1 || orphanDefaults.length > 0;
              const expanded = expandedMap[parent.slug] ?? true;
              return (
                <SortableTopLevelRow
                  key={parent.slug}
                  parent={parent}
                  childPages={children}
                  bySlug={bySlug}
                  collapsible={children.length > 0}
                  expanded={expanded}
                  onToggle={() => toggleExpanded(parent.slug)}
                  expandLabel={expanded ? s.collapseAllAria : s.expandAllAria}
                  onItemClick={onItemClick}
                  childrenContinue={childrenContinue}
                />
              );
            })}
          </SortableContext>
          <SortableContext items={orphanDefaults.map((p) => `orphan:${p.slug}`)} strategy={verticalListSortingStrategy}>
            {orphanDefaults.map((page) => (
              <SortableOrphanRow key={page.slug} page={page} onItemClick={onItemClick} />
            ))}
          </SortableContext>
        </DndContext>
      </CollapsibleSidebarGroup>
      <CreatePageDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        lockDefaultType={parentSlug !== undefined}
      />
    </>
  );
}

function FormsGroup({
  onItemClick,
  globalOpenState,
  globalOpenVersion,
  onOpenChange,
}: {
  onItemClick?: () => void;
  globalOpenState?: boolean | null;
  globalOpenVersion?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const { messages } = useI18n();
  const s = messages.layout.sidebar;

  return (
    <CollapsibleSidebarGroup
      routeMatch="/forms/*"
      storageKey="sidebar-forms-open"
      icon={<NotebookIcon weight="duotone" className="w-4 h-4" />}
      label={s.formBuilder}
      globalOpenState={globalOpenState}
      globalOpenVersion={globalOpenVersion}
      onOpenChange={onOpenChange}
    >
      <NavLink to="/forms" end onClick={onItemClick} className={sidebarGroupItemClass}>
        {s.formsOverview}
      </NavLink>
    </CollapsibleSidebarGroup>
  );
}

function EmailTemplatesGroup({
  onItemClick,
  globalOpenState,
  globalOpenVersion,
  onOpenChange,
}: {
  onItemClick?: () => void;
  globalOpenState?: boolean | null;
  globalOpenVersion?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const { messages } = useI18n();
  const common = messages.common;
  const s = messages.layout.sidebar;
  const { data: templates } = useEmailTemplates();
  const createTemplate = useCreateEmailTemplate();
  const navigate = useNavigate();

  return (
    <CollapsibleSidebarGroup
      routeMatch="/email-templates/*"
      storageKey="sidebar-email-templates-open"
      icon={<EnvelopeOpenIcon weight="duotone" className="w-4 h-4" />}
      label={s.emailTemplates}
      badge={templates?.length ?? 0}
      globalOpenState={globalOpenState}
      globalOpenVersion={globalOpenVersion}
      onOpenChange={onOpenChange}
    >
      <NavLink to="/email-templates" end onClick={onItemClick} className={sidebarGroupItemClass}>
        {s.emailTemplatesOverview}
      </NavLink>
      {(templates ?? []).map((tpl) => (
        <div key={tpl.id} className="group/item flex items-center">
          <NavLink
            to={`/email-templates/${tpl.id}`}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex-1 flex items-center gap-2 px-3 py-1.5 rounded-control text-sm font-medium min-w-0 ${
                isActive
                  ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
                  : "text-[var(--ds-nav-text)] hover:bg-[var(--ds-nav-hover-bg)] hover:text-[var(--ds-nav-hover-text)]"
              }`
            }
          >
            <EnvelopeOpenIcon weight="duotone" className="w-3.5 h-3.5 shrink-0 opacity-60" />
            <span className="truncate">{tpl.name}</span>
          </NavLink>
          <button
            type="button"
            title={common.duplicate}
            onClick={async (e) => {
              e.preventDefault();
              try {
                const created = await createTemplate.mutateAsync({
                  name: `${tpl.name} (Copy)`,
                  subject: tpl.subject,
                  bodyText: tpl.bodyText,
                  headerBannerUrl: tpl.headerBannerUrl ?? undefined,
                  headerText: tpl.headerText ?? undefined,
                  footerBannerUrl: tpl.footerBannerUrl ?? undefined,
                  footerText: tpl.footerText ?? undefined,
                });
                void navigate(`/email-templates/${created.id}`);
              } catch (err) {
                console.error("[duplicate template]", err);
              }
            }}
            className="opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto shrink-0 p-1 mr-1 rounded text-[var(--ds-nav-text)] hover:text-[var(--ds-nav-hover-text)] hover:bg-[var(--ds-nav-hover-bg)]"
          >
            <CopyIcon weight="duotone" className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </CollapsibleSidebarGroup>
  );
}

export function Sidebar({
  username,
  firstName,
  lastName,
  avatarUrl,
  role,
  onLogout,
  onItemClick,
  onEditProfile,
  bare,
}: SidebarProps) {
  const { messages } = useI18n();
  const s = messages.layout.sidebar;
  const isAdmin = role !== undefined && ROLE_RANK[role] >= ROLE_RANK.admin;
  const { data: stats } = useAdminStats();

  const [groupOpenVersion, setGroupOpenVersion] = useState(0);
  const [groupOpenState, setGroupOpenState] = useState<boolean | null>(null);
  const [groupStatus, setGroupStatus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SIDEBAR_GROUP_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key) === "true"])),
  );
  const areAllGroupsOpen = SIDEBAR_GROUP_STORAGE_KEYS.every((key) => groupStatus[key]);

  function handleToggleAllGroups(next: boolean) {
    SIDEBAR_GROUP_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, String(next)));
    setGroupStatus(Object.fromEntries(SIDEBAR_GROUP_STORAGE_KEYS.map((key) => [key, next])));
    setGroupOpenState(next);
    setGroupOpenVersion((version) => version + 1);
  }

  function handleGroupOpenChange(storageKey: (typeof SIDEBAR_GROUP_STORAGE_KEYS)[number], open: boolean) {
    setGroupStatus((current) => {
      if (current[storageKey] === open) return current;
      return { ...current, [storageKey]: open };
    });
  }

  return (
    <>
      {!bare && <SidebarHeader />}

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="sticky top-0 z-10 -mx-3 px-3 pt-3 pb-2 bg-[var(--ds-card-bg,var(--ds-surface))]">
          <button
            type="button"
            onClick={() => handleToggleAllGroups(!areAllGroupsOpen)}
            className="flex w-full items-center justify-center gap-2 h-8 rounded-control border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] text-xs font-medium text-[var(--ds-text-muted)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)] transition-colors"
            aria-label={areAllGroupsOpen ? s.collapseAllAria : s.expandAllAria}
            title={areAllGroupsOpen ? s.collapseAllAria : s.expandAllAria}
          >
            <span className="relative h-3.5 w-3.5 shrink-0 overflow-hidden">
              <CaretCircleDoubleDownIcon
                weight="duotone"
                className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ease-out ${
                  areAllGroupsOpen ? "-translate-y-1 opacity-0 scale-90" : "translate-y-0 opacity-100 scale-100"
                }`}
              />
              <CaretCircleDoubleUpIcon
                weight="duotone"
                className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ease-out ${
                  areAllGroupsOpen ? "translate-y-0 opacity-100 scale-100" : "translate-y-1 opacity-0 scale-90"
                }`}
              />
            </span>
            <span className="relative inline-grid overflow-hidden">
              <span
                className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
                  areAllGroupsOpen ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
                }`}
              >
                {s.expandAll}
              </span>
              <span
                className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
                  areAllGroupsOpen ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                {s.collapseAll}
              </span>
            </span>
          </button>
        </div>

        {/* General */}
        <div className="mt-3">
          <DashboardSection>
            <DashboardSection.Header
              icon={<HouseSimpleIcon weight="duotone" className="w-4 h-4" />}
              title={s.sectionGeneral}
            />
            <DashboardSection.Body className="!gap-0.5 !p-2">
              <NavLink to="/" end onClick={onItemClick} className="contents">
                {({ isActive }) => (
                  <DashboardSection.Item
                    icon={<SquaresFourIcon weight="duotone" className="w-4 h-4" />}
                    label={s.overview}
                    active={isActive}
                  />
                )}
              </NavLink>
            </DashboardSection.Body>
          </DashboardSection>
        </div>

        {/* Music */}
        <div className="mt-3">
          <DashboardSection>
            <DashboardSection.Header
              icon={<MusicNotesIcon weight="duotone" className="w-4 h-4" />}
              title={s.sectionMusic}
            />
            <DashboardSection.Body className="!gap-0.5 !p-2">
              <NavLink to="/tracks" onClick={onItemClick} className="contents">
                {({ isActive }) => (
                  <DashboardSection.Item
                    icon={<MusicNotesIcon weight="duotone" className="w-4 h-4" />}
                    label={s.tracks}
                    badge={stats?.tracks}
                    active={isActive}
                  />
                )}
              </NavLink>
              <NavLink to="/albums" onClick={onItemClick} className="contents">
                {({ isActive }) => (
                  <DashboardSection.Item
                    icon={<VinylRecordIcon weight="duotone" className="w-4 h-4" />}
                    label={s.albums}
                    badge={stats?.albums}
                    active={isActive}
                  />
                )}
              </NavLink>
              <NavLink to="/artists" onClick={onItemClick} className="contents">
                {({ isActive }) => (
                  <DashboardSection.Item
                    icon={<MicrophoneStageIcon weight="duotone" className="w-4 h-4" />}
                    label={s.artists}
                    badge={stats?.artists}
                    active={isActive}
                  />
                )}
              </NavLink>
            </DashboardSection.Body>
          </DashboardSection>
        </div>

        {/* Content */}
        {isAdmin && (
          <div className="mt-3">
            <DashboardSection>
              <DashboardSection.Header
                icon={<CopyIcon weight="duotone" className="w-4 h-4" />}
                title={s.sectionContent}
              />
              <DashboardSection.Body className="!gap-0.5 !p-2">
                <PagesGroup
                  onItemClick={onItemClick}
                  globalOpenState={groupOpenState}
                  globalOpenVersion={groupOpenVersion}
                  onOpenChange={(open) => handleGroupOpenChange("sidebar-pages-open", open)}
                />
                <NavLink to="/navigation" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<ListIcon weight="duotone" className="w-4 h-4" />}
                      label={s.navigations}
                      active={isActive}
                    />
                  )}
                </NavLink>
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        )}

        {/* Templates */}
        {isAdmin && (
          <div className="mt-3">
            <DashboardSection>
              <DashboardSection.Header
                icon={<NotebookIcon weight="duotone" className="w-4 h-4" />}
                title={s.sectionTemplates}
              />
              <DashboardSection.Body className="!gap-0.5 !p-2">
                <FormsGroup
                  onItemClick={onItemClick}
                  globalOpenState={groupOpenState}
                  globalOpenVersion={groupOpenVersion}
                  onOpenChange={(open) => handleGroupOpenChange("sidebar-forms-open", open)}
                />
                <EmailTemplatesGroup
                  onItemClick={onItemClick}
                  globalOpenState={groupOpenState}
                  globalOpenVersion={groupOpenVersion}
                  onOpenChange={(open) => handleGroupOpenChange("sidebar-email-templates-open", open)}
                />
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        )}

        {/* Analytics */}
        {isAdmin && (
          <div className="mt-3">
            <DashboardSection>
              <DashboardSection.Header
                icon={<ChartBarIcon weight="duotone" className="w-4 h-4" />}
                title={s.sectionAnalytics}
              />
              <DashboardSection.Body className="!gap-0.5 !p-2">
                <NavLink to="/analytics" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<ChartBarIcon weight="duotone" className="w-4 h-4" />}
                      label={s.analytics}
                      active={isActive}
                    />
                  )}
                </NavLink>
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        )}

        {/* System */}
        {isAdmin && (
          <div className="mt-3">
            <DashboardSection>
              <DashboardSection.Header
                icon={<GearIcon weight="duotone" className="w-4 h-4" />}
                title={s.sectionSystem}
              />
              <DashboardSection.Body className="!gap-0.5 !p-2">
                <NavLink to="/users" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<UsersThreeIcon weight="duotone" className="w-4 h-4" />}
                      label={s.users}
                      active={isActive}
                    />
                  )}
                </NavLink>
                <NavLink to="/markdown-widgets" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<MarkdownLogoIcon weight="duotone" className="w-4 h-4" />}
                      label={s.markdownWidgets}
                      active={isActive}
                    />
                  )}
                </NavLink>
                <NavLink to="/services" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<PlugsConnectedIcon weight="duotone" className="w-4 h-4" />}
                      label={s.services}
                      active={isActive}
                    />
                  )}
                </NavLink>
                <NavLink to="/system" onClick={onItemClick} className="contents">
                  {({ isActive }) => (
                    <DashboardSection.Item
                      icon={<GearIcon weight="duotone" className="w-4 h-4" />}
                      label={s.system}
                      active={isActive}
                    />
                  )}
                </NavLink>
              </DashboardSection.Body>
            </DashboardSection>
          </div>
        )}
      </nav>

      {!bare && (
        <SidebarFooter
          username={username}
          firstName={firstName}
          lastName={lastName}
          role={role}
          avatarUrl={avatarUrl}
          onLogout={onLogout}
          onEditProfile={onEditProfile}
        />
      )}
    </>
  );
}
