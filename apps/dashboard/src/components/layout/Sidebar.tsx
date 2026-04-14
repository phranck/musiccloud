import {
  CaretCircleDoubleDownIcon,
  CaretCircleDoubleUpIcon,
  ChartBarIcon,
  CopyIcon,
  EnvelopeOpenIcon,
  GearIcon,
  HouseSimpleIcon,
  MarkdownLogoIcon,
  MicrophoneStageIcon,
  MusicNotesIcon,
  NotebookIcon,
  PlugsConnectedIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NavLink } from "react-router";

import { CollapsibleSidebarGroup, sidebarGroupItemClass } from "@/components/layout/CollapsibleSidebarGroup";
import { SidebarFooter } from "@/components/layout/SidebarFooter";
import { SidebarHeader } from "@/components/layout/SidebarHeader";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { useAdminStats } from "@/features/overview/hooks/useAdminStats";
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

  return (
    <CollapsibleSidebarGroup
      routeMatch="/pages/*"
      storageKey="sidebar-pages-open"
      icon={<CopyIcon weight="duotone" className="w-4 h-4" />}
      label={s.pages}
      globalOpenState={globalOpenState}
      globalOpenVersion={globalOpenVersion}
      onOpenChange={onOpenChange}
    >
      <NavLink to="/pages" end onClick={onItemClick} className={sidebarGroupItemClass}>
        {s.pagesOverview}
      </NavLink>
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
  const s = messages.layout.sidebar;

  return (
    <CollapsibleSidebarGroup
      routeMatch="/email-templates/*"
      storageKey="sidebar-email-templates-open"
      icon={<EnvelopeOpenIcon weight="duotone" className="w-4 h-4" />}
      label={s.emailTemplates}
      globalOpenState={globalOpenState}
      globalOpenVersion={globalOpenVersion}
      onOpenChange={onOpenChange}
    >
      <NavLink to="/email-templates" end onClick={onItemClick} className={sidebarGroupItemClass}>
        {s.emailTemplatesOverview}
      </NavLink>
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
