import { PencilSimple as PencilSimpleIcon, UsersThree as UsersThreeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { useI18n } from "@/context/I18nContext";
import type { DeveloperAccountResponse } from "@/features/developer/api";
import { DeveloperAccountStatus } from "@/features/developer/domain";
import { useDeveloperAccounts } from "@/features/developer/hooks/useDeveloperData";
import { formatDate } from "@/features/developer/lib";
import type { DashboardLocale } from "@/i18n/messages";

const STATUS_CLASS: Record<string, string> = {
  [DeveloperAccountStatus.Active]: "bg-emerald-500/10 text-emerald-400",
  [DeveloperAccountStatus.Suspended]: "bg-red-500/10 text-red-400",
};

function useAccountColumns(
  dm: ReturnType<typeof useI18n>["messages"]["developer"],
  common: ReturnType<typeof useI18n>["messages"]["common"],
  locale: DashboardLocale,
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<DeveloperAccountResponse>[] {
  return useMemo<ColumnDef<DeveloperAccountResponse>[]>(
    () => [
      {
        id: "email",
        header: dm.colEmail,
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.email.toLowerCase(),
        cell: (a) => <span className="font-medium">{a.email}</span>,
      },
      {
        id: "displayName",
        header: dm.colDisplayName,
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.displayName ?? "",
        cell: (a) => <span className="text-[var(--ds-text-muted)]">{a.displayName ?? "—"}</span>,
      },
      {
        id: "appName",
        header: dm.colAppName,
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => (a.appName ?? "").toLowerCase(),
        cell: (a) => <span className="text-[var(--ds-text-muted)]">{a.appName ?? "—"}</span>,
      },
      {
        id: "tier",
        header: dm.colTier,
        className: "w-40",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.tierName ?? "",
        cell: (a) =>
          a.tierName ? (
            <span className="inline-flex items-center gap-1.5">
              <span>{a.tierName}</span>
              {a.tierEnabled === false && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                  {dm.tierInactiveBadge}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--ds-text-muted)]">—</span>
          ),
      },
      {
        id: "status",
        header: dm.colStatus,
        className: "w-28",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.status,
        cell: (a) => {
          const cls = STATUS_CLASS[a.status] ?? "bg-gray-500/10 text-gray-400";
          const labelMap: Record<string, string> = {
            [DeveloperAccountStatus.Active]: dm.statusActive,
            [DeveloperAccountStatus.Suspended]: dm.statusSuspended,
          };
          return (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
              {labelMap[a.status] ?? a.status}
            </span>
          );
        },
      },
      {
        id: "createdAt",
        header: dm.colRegistered,
        className: "w-36",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.createdAt,
        cell: (a) => (
          <span className="text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(a.createdAt, locale)}</span>
        ),
      },
      {
        id: "actions",
        className: "w-24",
        cell: (a) => (
          <div className="flex justify-end">
            <TableActionButton
              onClick={() => navigate(`/developer/accounts/${a.id}`)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={common.edit}
            />
          </div>
        ),
      },
    ],
    [dm, common, locale, navigate],
  );
}

export function DeveloperAccountsPage() {
  const { messages, locale } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useDeveloperAccounts();
  const navigate = useNavigate();
  const columns = useAccountColumns(dm, messages.common, locale, navigate);
  const accounts = data?.accounts ?? [];

  return (
    <PageLayout>
      <PageHeader title={dm.accountsTitle} />

      {isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {!isLoading && accounts.length === 0 && (
        <ContentUnavailableView
          icon={<UsersThreeIcon weight="duotone" aria-hidden />}
          title={dm.noAccounts}
          subtitle={dm.noAccountsHint}
          className="flex-1 min-h-0"
        />
      )}

      {!isLoading && accounts.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header
            icon={<UsersThreeIcon weight="duotone" className="size-4" />}
            title={dm.accountsTitle}
          />
          <DashboardSection.Body flush>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DataTable
                columns={columns}
                data={accounts}
                getRowKey={(a) => a.id}
                stickyHeader
                defaultSort={{ id: "createdAt", dir: "desc" }}
              />
            </div>
          </DashboardSection.Body>
        </DashboardSection>
      )}
    </PageLayout>
  );
}
