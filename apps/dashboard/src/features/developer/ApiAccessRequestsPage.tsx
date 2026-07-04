import { ClipboardText as ClipboardTextIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithoutRef, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { type ColumnDef, DataTable, type DataTableRowProps } from "@/components/ui/Table";
import { Toolbar } from "@/components/ui/Toolbar";
import { useI18n } from "@/context/I18nContext";
import type { ApiAccessRequestResponse } from "@/features/developer/api";
import { ApiAccessRequestStatus } from "@/features/developer/domain";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";

function ClickableRow({
  className,
  children,
  onClick,
  ...rest
}: DataTableRowProps<ApiAccessRequestResponse> & { onClick: () => void } & ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      className={`table-row-hover cursor-pointer ${className ?? ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      {...rest}
    >
      {children}
    </tr>
  );
}

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
        headerClassName: "whitespace-nowrap",
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
        headerClassName: "whitespace-nowrap",
        sortKey: (r) => r.contactEmail.toLowerCase(),
        cell: (r) => <span className="text-[var(--ds-text-muted)]">{r.contactEmail}</span>,
      },
      {
        id: "estimatedRequestsPerDay",
        header: dm.colTraffic,
        className: "w-32",
        headerClassName: "whitespace-nowrap",
        sortKey: (r) => r.estimatedRequestsPerDay,
        cell: (r) => <span>~{r.estimatedRequestsPerDay} / Tag</span>,
      },
      {
        id: "submittedAt",
        header: dm.colSubmitted,
        className: "w-36",
        headerClassName: "whitespace-nowrap",
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
        headerClassName: "whitespace-nowrap",
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
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useApiAccessOverview(filter === "all" ? undefined : filter);

  const columns = useRequestColumns(dm);
  const navigate = useNavigate();

  const requests = data?.requests ?? [];

  const RowComponent = useMemo(
    () => (props: DataTableRowProps<ApiAccessRequestResponse>) => (
      <ClickableRow {...props} onClick={() => navigate(`/developer/requests/${props.row.id}`)} />
    ),
    [navigate],
  );

  const requestFilterOptions = useMemo(
    () => [
      { value: "all", label: dm.requestsFilterAll },
      { value: ApiAccessRequestStatus.Pending, label: dm.requestsFilterPending },
      { value: ApiAccessRequestStatus.Approved, label: dm.requestsFilterApproved },
      { value: ApiAccessRequestStatus.Rejected, label: dm.requestsFilterRejected },
    ],
    [dm],
  );

  const filterBar = <SegmentedControl value={filter} onChange={setFilter} options={requestFilterOptions} />;

  const toolbar = requests.length > 0 && (
    <Toolbar>
      <span className="text-sm text-[var(--ds-text-muted)]">
        {dm.requestCount.replace("{n}", String(requests.length))}
      </span>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageHeader title={dm.requestsTitle}>{filterBar}</PageHeader>
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

        {!isLoading && requests.length === 0 && (
          <ContentUnavailableView
            icon={<ClipboardTextIcon weight="duotone" aria-hidden />}
            title={dm.noRequests}
            className="flex-1 min-h-0"
          />
        )}

        {!isLoading && requests.length > 0 && (
          <div className="-mx-3 -mt-3 min-h-0 flex-1 overflow-y-auto">
            <DataTable
              columns={columns}
              data={requests}
              getRowKey={(r) => r.id}
              RowComponent={RowComponent}
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
