import {
  CaretCircleDoubleDownIcon,
  CaretCircleDoubleUpIcon,
  ChartBarIcon,
  CheckCircleIcon,
  CircleIcon,
  CopyIcon,
  EnvelopeOpenIcon,
  EyeSlashIcon,
  FileIcon,
  GearIcon,
  ImageIcon,
  LinkIcon,
  ListBulletsIcon,
  MarkdownLogoIcon,
  MusicNotesIcon,
  NotebookIcon,
  SquareHalfBottomIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router";

import type { AdminRole } from "@/shared/types/admin";

import {
  CollapsibleSidebarGroup,
  sidebarGroupItemClass,
} from "@/components/layout/CollapsibleSidebarGroup";
import { SidebarFooter } from "@/components/layout/SidebarFooter";
import { SidebarHeader } from "@/components/layout/SidebarHeader";
import { SidebarItem } from "@/components/layout/SidebarItem";
import { useI18n } from "@/context/I18nContext";

const ROLE_RANK: Record<AdminRole, number> = { owner: 2, admin: 1, moderator: 0 };
const SIDEBAR_GROUP_STORAGE_KEYS = [
  "sidebar-pages-open",
  "sidebar-forms-open",
  "sidebar-email-templates-open",
] as const;

function StatusIcon({ status }: { status: string }) {
  if (status === "published") {
    return <CheckCircleIcon weight="duotone" className="w-3 h-3 text-green-500 shrink-0" />;
  }
  if (status === "hidden") {
    return <EyeSlashIcon weight="duotone" className="w-3 h-3 text-gray-400 shrink-0" />;
  }
  return <CircleIcon weight="duotone" className="w-3 h-3 text-amber-500 shrink-0" />;
}

interface SidebarProps {
  username?: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  role?: AdminRole;
  onLogout: () => void;
  onItemClick?: () => void;
  onEditProfile?: () => void;
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

function SidebarSection({ label }: { label: string }) {
  return <p className="section-header -mx-3 px-3 mt-3 first:mt-0">{label}</p>;
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
}: SidebarProps) {
  const { messages } = useI18n();
  const s = messages.layout.sidebar;
  const isAdmin = role !== undefined && ROLE_RANK[role] >= ROLE_RANK.admin;

  const [groupOpenVersion, setGroupOpenVersion] = useState(0);
  const [groupOpenState, setGroupOpenState] = useState<boolean | null>(null);
  const [groupStatus, setGroupStatus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      SIDEBAR_GROUP_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key) === "true"]),
    ),
  );
  const areAllGroupsOpen = SIDEBAR_GROUP_STORAGE_KEYS.every((key) => groupStatus[key]);

  function handleToggleAllGroups(next: boolean) {
    SIDEBAR_GROUP_STORAGE_KEYS.forEach((key) => localStorage.setItem(key, String(next)));
    setGroupStatus(Object.fromEntries(SIDEBAR_GROUP_STORAGE_KEYS.map((key) => [key, next])));
    setGroupOpenState(next);
    setGroupOpenVersion((version) => version + 1);
  }

  function handleGroupOpenChange(
    storageKey: (typeof SIDEBAR_GROUP_STORAGE_KEYS)[number],
    open: boolean,
  ) {
    setGroupStatus((current) => {
      if (current[storageKey] === open) return current;
      return { ...current, [storageKey]: open };
    });
  }

  return (
    <>
      <SidebarHeader />

      <nav className="flex-1 overflow-y-auto px-3">
        <div className="sticky top-0 z-10 -mx-3 px-3 pt-3 pb-2 bg-[var(--ds-surface)]">
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
                  areAllGroupsOpen
                    ? "-translate-y-1 opacity-0 scale-90"
                    : "translate-y-0 opacity-100 scale-100"
                }`}
              />
              <CaretCircleDoubleUpIcon
                weight="duotone"
                className={`absolute inset-0 h-3.5 w-3.5 transition-all duration-200 ease-out ${
                  areAllGroupsOpen
                    ? "translate-y-0 opacity-100 scale-100"
                    : "translate-y-1 opacity-0 scale-90"
                }`}
              />
            </span>
            <span className="relative inline-grid overflow-hidden">
              <span
                className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
                  areAllGroupsOpen
                    ? "-translate-y-1 opacity-0"
                    : "translate-y-0 opacity-100"
                }`}
              >
                {s.expandAll}
              </span>
              <span
                className={`col-start-1 row-start-1 transition-all duration-200 ease-out ${
                  areAllGroupsOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0"
                }`}
              >
                {s.collapseAll}
              </span>
            </span>
          </button>
        </div>

        {/* General */}
        <SidebarSection label={s.sectionGeneral} />
        <div className="space-y-0.5">
          <SidebarItem
            to="/"
            label={s.overview}
            icon={<SquaresFourIcon weight="duotone" className="w-4 h-4" />}
            end
            onClick={onItemClick}
          />
        </div>

        {/* Music */}
        <SidebarSection label={s.sectionMusic} />
        <div className="space-y-0.5">
          <SidebarItem
            to="/tracks"
            label={s.tracks}
            icon={<MusicNotesIcon weight="duotone" className="w-4 h-4" />}
            onClick={onItemClick}
          />
          <SidebarItem
            to="/albums"
            label={s.albums}
            icon={<VinylRecordIcon weight="duotone" className="w-4 h-4" />}
            onClick={onItemClick}
          />
        </div>

        {/* Content */}
        {isAdmin && (
          <>
            <SidebarSection label={s.sectionContent} />
            <div className="space-y-0.5">
              <PagesGroup
                onItemClick={onItemClick}
                globalOpenState={groupOpenState}
                globalOpenVersion={groupOpenVersion}
                onOpenChange={(open) => handleGroupOpenChange("sidebar-pages-open", open)}
              />
            </div>
          </>
        )}

        {/* Templates */}
        {isAdmin && (
          <>
            <SidebarSection label={s.sectionTemplates} />
            <div className="space-y-0.5">
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
                onOpenChange={(open) =>
                  handleGroupOpenChange("sidebar-email-templates-open", open)
                }
              />
              <SidebarItem
                to="/footer-builder"
                label={s.footerBuilder}
                icon={<SquareHalfBottomIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
            </div>
          </>
        )}

        {/* Analytics */}
        {isAdmin && (
          <>
            <SidebarSection label={s.sectionAnalytics} />
            <div className="space-y-0.5">
              <SidebarItem
                to="/analytics"
                label={s.analytics}
                icon={<ChartBarIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
            </div>
          </>
        )}

        {/* System */}
        {isAdmin && (
          <>
            <SidebarSection label={s.sectionSystem} />
            <div className="space-y-0.5">
              <SidebarItem
                to="/users"
                label={s.users}
                icon={<UsersThreeIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
              <SidebarItem
                to="/media"
                label={s.media}
                icon={<ImageIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
              <SidebarItem
                to="/pages/navigations"
                label={s.navigations}
                icon={<LinkIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
              <SidebarItem
                to="/markdown-widgets"
                label={s.markdownWidgets}
                icon={<MarkdownLogoIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
              <SidebarItem
                to="/system"
                label={s.system}
                icon={<GearIcon weight="duotone" className="w-4 h-4" />}
                onClick={onItemClick}
              />
            </div>
          </>
        )}
      </nav>

      <SidebarFooter
        username={username}
        firstName={firstName}
        lastName={lastName}
        role={role}
        avatarUrl={avatarUrl}
        onLogout={onLogout}
        onEditProfile={onEditProfile}
      />
    </>
  );
}
