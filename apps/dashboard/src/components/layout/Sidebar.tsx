import {
  CaretCircleDoubleDownIcon,
  CaretCircleDoubleUpIcon,
  CaretDownIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CircleIcon,
  CopyIcon,
  EnvelopeOpenIcon,
  EyeSlashIcon,
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
  SquaresFourIcon,
  UsersThreeIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";

import { CollapsibleSidebarGroup, sidebarGroupItemClass } from "@/components/layout/CollapsibleSidebarGroup";
import { SidebarFooter } from "@/components/layout/SidebarFooter";
import { SidebarHeader } from "@/components/layout/SidebarHeader";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { useContentPages } from "@/features/content/hooks/useAdminContent";
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

function PageStatusIcon({ status }: { status: string }) {
  if (status === "published") {
    return <CheckCircleIcon weight="duotone" className="w-3 h-3 text-green-500 shrink-0" />;
  }
  if (status === "hidden") {
    return <EyeSlashIcon weight="duotone" className="w-3 h-3 text-gray-400 shrink-0" />;
  }
  return <CircleIcon weight="duotone" className="w-3 h-3 text-amber-500 shrink-0" />;
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
  return (
    <>
      {icon}
      <PageStatusIcon status={page.status} />
      <span className="flex flex-col min-w-0">
        <span className="truncate">{page.title}</span>
        <span className="truncate text-xs opacity-50">/{page.slug}</span>
      </span>
    </>
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
  const { data: pages } = useContentPages();

  const list = pages ?? [];
  const bySlug = new Map(list.map((p) => [p.slug, p]));
  const segmentedParents = list.filter((p) => p.pageType === "segmented");
  const renderedChildren = new Set<string>();
  const segmentedBlocks = segmentedParents.map((parent) => {
    const children = (parent.segments ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((seg) => bySlug.get(seg.targetSlug))
      .filter((p): p is NonNullable<typeof p> => p !== undefined && !renderedChildren.has(p.slug));
    children.forEach((c) => renderedChildren.add(c.slug));
    return { parent, children };
  });
  const orphanDefaults = list.filter((p) => p.pageType === "default" && !renderedChildren.has(p.slug));

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

  type RowSpec =
    | { kind: "overview" }
    | {
        kind: "parent";
        page: (typeof list)[number];
        ancestorContinues: TreeDepth[];
        collapsible: boolean;
        expanded: boolean;
      }
    | { kind: "child"; page: (typeof list)[number]; ancestorContinues: TreeDepth[]; isFirstChild: boolean }
    | { kind: "orphan"; page: (typeof list)[number] };

  const rowSpecs: RowSpec[] = [{ kind: "overview" }];
  segmentedBlocks.forEach(({ parent, children }, blockIdx) => {
    const moreD1Below = blockIdx < segmentedBlocks.length - 1 || orphanDefaults.length > 0;
    const expanded = expandedMap[parent.slug] ?? true;
    rowSpecs.push({
      kind: "parent",
      page: parent,
      ancestorContinues: [],
      collapsible: children.length > 0,
      expanded,
    });
    if (!expanded) return;
    children.forEach((child, childIdx) => {
      rowSpecs.push({
        kind: "child",
        page: child,
        ancestorContinues: moreD1Below ? [1] : [],
        isFirstChild: childIdx === 0,
      });
    });
  });
  orphanDefaults.forEach((page) => {
    rowSpecs.push({ kind: "orphan", page });
  });

  return (
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
    >
      {rowSpecs.map((spec, idx) => {
        if (spec.kind === "overview") {
          return (
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
          );
        }
        const depth: TreeDepth = spec.kind === "child" ? 2 : 1;
        const isFirstAtTopLevel = idx === 0;
        const icon =
          spec.kind === "parent" ? (
            <FileDashedIcon weight="duotone" className="w-4 h-4 shrink-0 opacity-70" />
          ) : (
            <FileMdIcon weight="duotone" className="w-4 h-4 shrink-0 opacity-70" />
          );
        const collapsibleProps =
          spec.kind === "parent" && spec.collapsible
            ? {
                collapsible: true as const,
                expanded: spec.expanded,
                onToggleExpanded: () => toggleExpanded(spec.page.slug),
                toggleAriaLabel: spec.expanded ? s.collapseAllAria : s.expandAllAria,
              }
            : {};
        return (
          <PageTreeRow
            key={spec.page.slug}
            depth={depth}
            ancestorContinues={spec.kind === "child" ? spec.ancestorContinues : []}
            isFirstChild={spec.kind === "child" && spec.isFirstChild}
            isFirstAtTopLevel={isFirstAtTopLevel}
            to={`/pages/${spec.page.slug}`}
            onItemClick={onItemClick}
            {...collapsibleProps}
          >
            <PageTreeContent page={spec.page} icon={icon} />
          </PageTreeRow>
        );
      })}
    </CollapsibleSidebarGroup>
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
