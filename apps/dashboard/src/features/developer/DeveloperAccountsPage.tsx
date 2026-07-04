import { UsersThree as UsersThreeIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";
import type { DeveloperAccountResponse } from "@/features/developer/api";
import { DeveloperAccountStatus } from "@/features/developer/domain";
import { useDeveloperAccounts } from "@/features/developer/hooks/useDeveloperData";

const STATUS_CLASS: Record<string, string> = {
  [DeveloperAccountStatus.Active]: "bg-emerald-500/10 text-emerald-400",
  [DeveloperAccountStatus.Suspended]: "bg-red-500/10 text-red-400",
};

function useAccountColumns(
  dm: ReturnType<typeof useI18n>["messages"]["developer"],
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
        id: "plan",
        header: dm.colPlan,
        className: "w-20",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.plan,
        cell: (a) => <span>{a.plan}</span>,
      },
      {
        id: "clientCount",
        header: dm.colClients,
        className: "w-20",
        headerClassName: "whitespace-nowrap",
        sortKey: (a) => a.clientCount,
        cell: (a) => (
          <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
            {a.clientCount}
          </span>
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
          <span className="text-[var(--ds-text-muted)] whitespace-nowrap">
            {new Date(a.createdAt).toLocaleDateString("de-AT")}
          </span>
        ),
      },
    ],
    [dm],
  );
}

export function DeveloperAccountsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useDeveloperAccounts();

  const columns = useAccountColumns(dm);
  const accounts = data?.accounts ?? [];

  const toolbar = accounts.length > 0 && (
    <Toolbar>
      <span className="text-sm text-[var(--ds-text-muted)]">
        {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
      </span>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={dm.accountsTitle} />
      <PageBody>
        {isLoading && (
          <div className="space-y-px">
            {Array.from({ length: 8 }, (_, i) => `sk-${i}`).map((key) => (
              <div
                key={key}
                className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]"
              />
            ))}
          </div>
        )}

        {!isLoading && accounts.length === 0 && (
          <ContentUnavailableView
            icon={<UsersThreeIcon weight="duotone" aria-hidden />}
            title="Keine Developer Accounts"
            className="flex-1 min-h-0"
          />
        )}

        {!isLoading && accounts.length > 0 && (
          <div className="-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto">
            <DataTable
              columns={columns}
              data={accounts}
              getRowKey={(a) => a.id}
              stickyHeader
              defaultSort={{ id: "createdAt", dir: "desc" }}
            />
          </div>
        )}
      </PageBody>
      {toolbar}
    </PageLayout>
  );
}
