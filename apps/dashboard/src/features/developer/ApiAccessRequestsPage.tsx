import { ClipboardText as ClipboardTextIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageBody, PageHeader, PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";
import type { ApiAccessRequestResponse } from "@/features/developer/api";
import { ApiAccessRequestStatus } from "@/features/developer/domain";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";

const STATUS_CLASS: Record<string, string> = {
  [ApiAccessRequestStatus.Pending]: "bg-amber-500/10 text-amber-400",
  [ApiAccessRequestStatus.Approved]: "bg-emerald-500/10 text-emerald-400",
  [ApiAccessRequestStatus.Rejected]: "bg-red-500/10 text-red-400",
};

function useRequestColumns(
  dm: ReturnType<typeof useI18n>["messages"]["developer"],
): ColumnDef<ApiAccessRequestResponse>[] {
  return useMemo<ColumnDef<ApiAccessRequestResponse>[]>(
    () => [
      {
        id: "appName",
        header: dm.colApp,
        sortKey: (r) => r.appName.toLowerCase(),
        cell: (r) => (
          <Link to={`/developer/requests/${r.id}`} className="font-medium text-[var(--ds-text)] hover:underline">
            {r.appName}
          </Link>
        ),
      },
      {
        id: "contactEmail",
        header: dm.colDeveloper,
        sortKey: (r) => r.contactEmail.toLowerCase(),
        cell: (r) => <span className="text-[var(--ds-text-muted)]">{r.contactEmail}</span>,
      },
      {
        id: "estimatedRequestsPerDay",
        header: dm.colTraffic,
        className: "w-32",
        sortKey: (r) => r.estimatedRequestsPerDay,
        cell: (r) => <span>~{r.estimatedRequestsPerDay} / Tag</span>,
      },
      {
        id: "submittedAt",
        header: dm.colSubmitted,
        className: "w-36",
        sortKey: (r) => r.submittedAt,
        cell: (r) => (
          <span className="text-[var(--ds-text-muted)] whitespace-nowrap">
            {new Date(r.submittedAt).toLocaleDateString("de-AT")}
          </span>
        ),
      },
      {
        id: "status",
        header: dm.colStatus,
        className: "w-28",
        sortKey: (r) => r.status,
        cell: (r) => {
          const cls = STATUS_CLASS[r.status] ?? "bg-gray-500/10 text-gray-400";
          const labelMap: Record<string, string> = {
            [ApiAccessRequestStatus.Pending]: dm.statusPending,
            [ApiAccessRequestStatus.Approved]: dm.statusApproved,
            [ApiAccessRequestStatus.Rejected]: dm.statusRejected,
          };
          return (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
              {labelMap[r.status] ?? r.status}
            </span>
          );
        },
      },
    ],
    [dm],
  );
}

export function ApiAccessRequestsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useApiAccessOverview(filter);

  const columns = useRequestColumns(dm);

  const requests = data?.requests ?? [];

  const filters = [
    { key: undefined, label: dm.requestsFilterAll },
    { key: ApiAccessRequestStatus.Pending, label: dm.requestsFilterPending },
    { key: ApiAccessRequestStatus.Approved, label: dm.requestsFilterApproved },
    { key: ApiAccessRequestStatus.Rejected, label: dm.requestsFilterRejected },
  ];

  const filterBar = (
    <div className="flex gap-2">
      {filters.map((f) => (
        <button
          key={f.key ?? "__all"}
          type="button"
          onClick={() => setFilter(f.key)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            filter === f.key
              ? "bg-[var(--ds-accent)] text-black"
              : "bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  const toolbar = requests.length > 0 && (
    <Toolbar>
      <span className="text-sm text-[var(--ds-text-muted)]">
        {requests.length} {requests.length === 1 ? "Request" : "Requests"}
      </span>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={dm.requestsTitle}>{filterBar}</PageHeader>
      <PageBody>
        {isLoading && (
          <div className="space-y-px">
            {Array.from({ length: 5 }, (_, i) => `sk-${i}`).map((key) => (
              <div
                key={key}
                className="h-14 bg-[var(--ds-surface)] animate-pulse border-b border-[var(--ds-border-subtle)]"
              />
            ))}
          </div>
        )}

        {!isLoading && requests.length === 0 && (
          <ContentUnavailableView
            icon={<ClipboardTextIcon weight="duotone" aria-hidden />}
            title="Keine Requests"
            className="flex-1 min-h-0"
          />
        )}

        {!isLoading && requests.length > 0 && (
          <div className="-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto">
            <DataTable
              columns={columns}
              data={requests}
              getRowKey={(r) => r.id}
              stickyHeader
              defaultSort={{ id: "submittedAt", dir: "desc" }}
            />
          </div>
        )}
      </PageBody>
      {toolbar}
    </PageLayout>
  );
}
