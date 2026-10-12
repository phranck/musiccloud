import { CONTENT_STATUSES, ContentStatus, isOneOf } from "@musiccloud/shared";
import { CheckCircleIcon, CircleIcon, EyeSlashIcon, type Icon } from "@phosphor-icons/react";

import { dashboardCopy } from "@/copy/dashboard";

interface StatusDef {
  icon: Icon;
  badgeClass: string;
  iconClass: string;
}

const STATUS_DEFS: Record<ContentStatus, StatusDef> = {
  [ContentStatus.Published]: {
    icon: CheckCircleIcon,
    badgeClass: "text-green-400",
    iconClass: "text-green-500",
  },
  [ContentStatus.Hidden]: {
    icon: EyeSlashIcon,
    badgeClass: "text-[var(--ds-text-muted)]",
    iconClass: "text-gray-400",
  },
  [ContentStatus.Draft]: {
    icon: CircleIcon,
    badgeClass: "text-amber-400",
    iconClass: "text-amber-500",
  },
};

/** The status a row is drawn with: its own, or draft for a value the dashboard does not know. */
function statusOf(status: string): ContentStatus {
  return isOneOf(CONTENT_STATUSES, status) ? status : ContentStatus.Draft;
}

export function PageStatusIcon({ status }: { status: string }) {
  const def = STATUS_DEFS[statusOf(status)];
  const StatusIcon = def.icon;
  return <StatusIcon weight="duotone" className={`w-3 h-3 shrink-0 ${def.iconClass}`} />;
}

export function PageStatusBadge({ status }: { status: string }) {
  const known = statusOf(status);
  const def = STATUS_DEFS[known];
  const StatusIcon = def.icon;
  const label = dashboardCopy.content.pages.status[known];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${def.badgeClass}`}>
      <StatusIcon weight="duotone" className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
