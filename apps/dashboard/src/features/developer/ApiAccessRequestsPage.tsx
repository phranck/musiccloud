import { ClipboardText as ClipboardTextIcon, PencilSimple as PencilSimpleIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithoutRef, useMemo } from "react";
import { useNavigate } from "react-router";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable, type DataTableRowProps } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import type { ApiAccessRequestResponse } from "@/features/developer/api";
import { ApiAccessRequestStatus } from "@/features/developer/domain";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";
import { formatDate } from "@/features/developer/lib";

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

function useRequestColumns(
  dm: (typeof dashboardCopy)["developer"],
  common: (typeof dashboardCopy)["common"],
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<ApiAccessRequestResponse>[] {
  return useMemo<ColumnDef<ApiAccessRequestResponse>[]>(
    () => [
      {
        id: "appName",
        header: dm.colApp,
        headerClassName: "whitespace-nowrap",
        sortKey: (r) => r.appName.toLowerCase(),
        cell: (r) => (
          <div>
            <span className="font-medium text-[var(--ds-text)]">{r.appName}</span>
            {r.appDescription && (
              <span className="block text-xs text-[var(--ds-text-muted)] truncate max-w-64">{r.appDescription}</span>
            )}
          </div>
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
        cell: (r) => (
          <span>
            ~{r.estimatedRequestsPerDay} {dm.perDay}
          </span>
        ),
      },
      {
        id: "submittedAt",
        header: dm.colSubmitted,
        className: "w-36",
        headerClassName: "whitespace-nowrap",
        sortKey: (r) => r.submittedAt,
        cell: (r) => <span className="text-[var(--ds-text-muted)] whitespace-nowrap">{formatDate(r.submittedAt)}</span>,
      },
      {
        id: "actions",
        className: "w-24",
        cell: (r) => (
          <div className="flex justify-end">
            <TableActionButton
              onClick={() => navigate(`/developer/requests/${r.id}`)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={common.edit}
            />
          </div>
        ),
      },
    ],
    [dm, common, navigate],
  );
}

export function ApiAccessRequestsPage() {
  const messages = dashboardCopy;
  const dm = messages.developer;
  const { data, isLoading } = useApiAccessOverview(ApiAccessRequestStatus.Pending);

  const navigate = useNavigate();
  const columns = useRequestColumns(dm, messages.common, navigate);

  const requests = data?.requests ?? [];

  const RowComponent = useMemo(
    () => (props: DataTableRowProps<ApiAccessRequestResponse>) => (
      <ClickableRow {...props} onClick={() => navigate(`/developer/requests/${props.row.id}`)} />
    ),
    [navigate],
  );

  return (
    <PageLayout>
      <PageHeader title={dm.requestsTitle} />

      {isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {!isLoading && requests.length === 0 && (
        <ContentUnavailableView
          icon={<ClipboardTextIcon weight="duotone" aria-hidden />}
          title={dm.noRequests}
          subtitle={dm.noRequestsHint}
          className="flex-1 min-h-0"
        />
      )}

      {!isLoading && requests.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header
            icon={<ClipboardTextIcon weight="duotone" className="size-4" />}
            title={dm.requestsTitle}
          />
          <DashboardSection.Body flush>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DataTable
                columns={columns}
                data={requests}
                getRowKey={(r) => r.id}
                RowComponent={RowComponent}
                stickyHeader
                defaultSort={{ id: "submittedAt", dir: "desc" }}
              />
            </div>
          </DashboardSection.Body>
        </DashboardSection>
      )}
    </PageLayout>
  );
}
