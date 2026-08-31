import { type ColumnDef, DataTable, DataTableScroll } from "@musiccloud/dashboard-ui";
import { PencilSimple as PencilSimpleIcon, Stack as StackIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import type { ApiClientResponse, DeveloperProjectResponse } from "@/features/developer/api";
import { ProjectStatusBadge } from "@/features/developer/components/ProjectStatusBadge";
import { useDeveloperProjects } from "@/features/developer/hooks/useDeveloperData";
import { formatEnglishDate } from "@/lib/format";

const messages = dashboardCopy;
const dm = messages.developer;

/**
 * The limits actually enforced on a project, as one line.
 *
 * A project without a granting plan has no quota rather than an
 * administrative one, so it says that instead of printing a number nothing
 * enforces.
 *
 * @param project - The project to describe.
 * @returns The limit line, or the no-plan label.
 */
function limitsLabel(project: DeveloperProjectResponse): string {
  if (project.effectiveRequestsPerMinute === null || project.effectiveRequestsPerDay === null) {
    return dm.clientTrafficNoPlan;
  }
  return `${project.effectiveRequestsPerMinute}${dm.perMinute} · ${project.effectiveRequestsPerDay}${dm.perDay}`;
}

/**
 * Column definitions for the project table on a developer account.
 *
 * @param registrationCounts - How many registrations each project holds, keyed
 *   by project id. A project missing from the map holds none.
 * @param navigate - Router navigate function used by the open action.
 * @returns Stable column definitions.
 */
function useProjectColumns(
  registrationCounts: Record<string, number>,
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<DeveloperProjectResponse>[] {
  return useMemo<ColumnDef<DeveloperProjectResponse>[]>(
    () => [
      {
        id: "displayName",
        header: dm.colProject,
        headerClassName: "whitespace-nowrap",
        sortKey: (project) => project.displayName.toLowerCase(),
        cell: (project) => <span className="font-medium text-[var(--ds-text)]">{project.displayName}</span>,
      },
      {
        id: "plan",
        header: dm.colTier,
        headerClassName: "whitespace-nowrap",
        className: "w-40",
        sortKey: (project) => (project.tierName ?? "").toLowerCase(),
        cell: (project) => (
          <span className={project.tierName ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)]"}>
            {project.tierName ?? dm.projectNoPlan}
          </span>
        ),
      },
      {
        id: "limits",
        header: dm.colLimits,
        headerClassName: "whitespace-nowrap",
        className: "w-52",
        sortKey: (project) => project.effectiveRequestsPerMinute ?? 0,
        cell: (project) => (
          <span className="inline-flex items-center gap-1.5">
            <span>{limitsLabel(project)}</span>
            {(project.requestsPerMinute != null || project.requestsPerDay != null) && (
              <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-xs font-semibold text-violet-400">
                {dm.clientCustomBadge}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "registrations",
        header: dm.colRegistrations,
        headerClassName: "whitespace-nowrap",
        className: "w-32 text-right",
        sortKey: (project) => registrationCounts[project.id] ?? 0,
        cell: (project) => <span className="block text-right tabular-nums">{registrationCounts[project.id] ?? 0}</span>,
      },
      {
        id: "status",
        header: dm.colStatus,
        headerClassName: "whitespace-nowrap",
        className: "w-28",
        sortKey: (project) => project.status,
        cell: (project) => <ProjectStatusBadge status={project.status} />,
      },
      {
        id: "createdAt",
        header: dm.colCreated,
        headerClassName: "whitespace-nowrap",
        className: "w-32",
        sortKey: (project) => project.createdAt,
        cell: (project) => <span className="text-[var(--ds-text-muted)]">{formatEnglishDate(project.createdAt)}</span>,
      },
      {
        id: "actions",
        className: "w-24",
        cell: (project) => (
          <div className="flex justify-end">
            <TableActionButton
              onClick={() => navigate(`/developer/projects/${project.id}`)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={messages.common.edit}
            />
          </div>
        ),
      },
    ],
    [registrationCounts, navigate],
  );
}

/**
 * Props for {@link AccountProjectsSection}.
 */
export interface AccountProjectsSectionProps {
  /** The developer account whose projects to list. */
  accountId: string;
  /**
   * Every registration the operator can see, used to count them per project.
   * The count comes from here rather than from the project rows, because the
   * project route does not carry one.
   */
  registrations: ApiClientResponse[];
}

/**
 * The projects one developer account holds, as a section on its detail screen.
 *
 * A project owns the plan, the quota and the registrations under it, so this
 * is the screen an operator reaches for when asked why a developer is being
 * throttled. Each row opens the project's own detail.
 *
 * @param props - See {@link AccountProjectsSectionProps}.
 * @returns The projects section, or its empty state.
 */
export function AccountProjectsSection({ accountId, registrations }: AccountProjectsSectionProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useDeveloperProjects(accountId);
  const projects = useMemo(() => data?.projects ?? [], [data]);

  const registrationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const registration of registrations) {
      counts[registration.projectId] = (counts[registration.projectId] ?? 0) + 1;
    }
    return counts;
  }, [registrations]);

  const columns = useProjectColumns(registrationCounts, navigate);

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header icon={<StackIcon weight="duotone" className="size-4" />} title={dm.projectsTitle} />
      {isLoading || projects.length === 0 ? (
        <DashboardSection.Body>
          <p className="text-sm text-[var(--ds-text-muted)]">
            {isLoading ? messages.common.loading : dm.projectsEmpty}
          </p>
        </DashboardSection.Body>
      ) : (
        <DashboardSection.Body flush>
          <DataTable
            columns={columns}
            data={projects}
            getRowKey={(project) => project.id}
            defaultSort={{ id: "displayName", dir: "asc" }}
          >
            <DataTable.Viewport scroll={DataTableScroll.Self}>
              <DataTable.Head sticky />
              <DataTable.Rows />
            </DataTable.Viewport>
          </DataTable>
        </DashboardSection.Body>
      )}
    </DashboardSection>
  );
}
