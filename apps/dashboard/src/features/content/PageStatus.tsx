import { CheckCircleIcon, CircleIcon, EyeSlashIcon, type Icon } from "@phosphor-icons/react";

import { dashboardCopy } from "@/copy/dashboard";

interface StatusDef {
  icon: Icon;
  badgeClass: string;
  iconClass: string;
}

const STATUS_DEFS: Record<string, StatusDef> = {
  published: {
    icon: CheckCircleIcon,
    badgeClass: "text-green-400",
    iconClass: "text-green-500",
  },
  hidden: {
    icon: EyeSlashIcon,
    badgeClass: "text-[var(--ds-text-muted)]",
    iconClass: "text-gray-400",
  },
  draft: {
    icon: CircleIcon,
    badgeClass: "text-amber-400",
    iconClass: "text-amber-500",
  },
};

const PageStatus = {
  Published: "published",
  Hidden: "hidden",
  Draft: "draft",
} as const;

function defOf(status: string): StatusDef {
  return STATUS_DEFS[status] ?? STATUS_DEFS[PageStatus.Draft];
}

export function PageStatusIcon({ status }: { status: string }) {
  const def = defOf(status);
  const StatusIcon = def.icon;
  return <StatusIcon weight="duotone" className={`w-3 h-3 shrink-0 ${def.iconClass}`} />;
}

export function PageStatusBadge({ status }: { status: string }) {
  const def = defOf(status);
  const StatusIcon = def.icon;
  const messages = dashboardCopy;
  const labels = messages.content.pages.status;
  const label =
    status === PageStatus.Published ? labels.published : status === PageStatus.Hidden ? labels.hidden : labels.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${def.badgeClass}`}>
      <StatusIcon weight="duotone" className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
