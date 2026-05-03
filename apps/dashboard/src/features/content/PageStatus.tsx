import { CheckCircleIcon, CircleIcon, EyeSlashIcon, type Icon } from "@phosphor-icons/react";

import { useI18n } from "@/context/I18nContext";

interface StatusDef {
  icon: Icon;
  badgeClass: string;
  iconClass: string;
}

const STATUS_DEFS: Record<string, StatusDef> = {
  published: {
    icon: CheckCircleIcon,
    badgeClass: "text-green-600 dark:text-green-400",
    iconClass: "text-green-500",
  },
  hidden: {
    icon: EyeSlashIcon,
    badgeClass: "text-[var(--ds-text-muted)]",
    iconClass: "text-gray-400",
  },
  draft: {
    icon: CircleIcon,
    badgeClass: "text-amber-600 dark:text-amber-400",
    iconClass: "text-amber-500",
  },
};

function defOf(status: string): StatusDef {
  return STATUS_DEFS[status] ?? STATUS_DEFS.draft;
}

export function PageStatusIcon({ status }: { status: string }) {
  const def = defOf(status);
  const StatusIcon = def.icon;
  return <StatusIcon weight="duotone" className={`w-3 h-3 shrink-0 ${def.iconClass}`} />;
}

export function PageStatusBadge({ status }: { status: string }) {
  const def = defOf(status);
  const StatusIcon = def.icon;
  const { messages } = useI18n();
  const labels = messages.content.pages.status;
  const label = status === "published" ? labels.published : status === "hidden" ? labels.hidden : labels.draft;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${def.badgeClass}`}>
      <StatusIcon weight="duotone" className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}
