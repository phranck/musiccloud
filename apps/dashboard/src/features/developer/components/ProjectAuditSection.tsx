import { type ColumnDef, DataTable } from "@musiccloud/dashboard-ui";
import { ApiAccessAuditActorType, type ApiAccessAuditTrailEntry } from "@musiccloud/shared";
import { ClockCounterClockwise as ClockCounterClockwiseIcon } from "@phosphor-icons/react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { useProjectAudit } from "@/features/developer/hooks/useDeveloperData";
import { describeRequestFailure } from "@/shared/utils/api-error";

const messages = dashboardCopy;
const dm = messages.developer;

/** When an entry happened, to the minute, in the reader's own time zone. */
const WHEN_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** How a recorded value reads. `null` on a limit or a field means it was cleared. */
function formatDetailValue(value: unknown): string {
  if (value === null) return dm.auditValueCleared;
  if (typeof value === "boolean") return value ? dm.auditValueYes : dm.auditValueNo;
  if (typeof value === "number") return value.toLocaleString("en-US");
  return String(value);
}

/** The recorded details of an entry, one `label: value` per field. */
function AuditDetails({ details }: { details: Record<string, unknown> }) {
  const fields = Object.entries(details);
  if (fields.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
      {fields.map(([key, value]) => (
        <li key={key}>
          <span className="text-[var(--ds-text-muted)]">{dm.auditDetails[key] ?? key}:</span>{" "}
          <span className="text-[var(--ds-text)]">{formatDetailValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

const AUDIT_COLUMNS: ColumnDef<ApiAccessAuditTrailEntry>[] = [
  {
    id: "when",
    header: dm.auditColWhen,
    className: "w-40",
    cell: (entry) => (
      <span className="whitespace-nowrap text-sm text-[var(--ds-text-muted)]">
        {WHEN_FORMAT.format(new Date(entry.occurredAt))}
      </span>
    ),
  },
  {
    id: "who",
    header: dm.auditColWho,
    className: "w-48",
    cell: (entry) =>
      entry.actor ? (
        <div className="min-w-0">
          <span className="block truncate text-sm text-[var(--ds-text)]">{entry.actor.name ?? entry.actor.id}</span>
          <span className="block text-xs text-[var(--ds-text-muted)]">
            {entry.actor.type === ApiAccessAuditActorType.Admin ? dm.auditActorAdmin : dm.auditActorDeveloper}
          </span>
        </div>
      ) : (
        <span className="text-sm text-[var(--ds-text-muted)]">{dm.auditActorRemoved}</span>
      ),
  },
  {
    id: "what",
    header: dm.auditColWhat,
    className: "w-44",
    cell: (entry) => (
      <span className="text-sm font-medium text-[var(--ds-text)]">
        {dm.auditEvents[entry.eventType] ?? entry.eventType}
      </span>
    ),
  },
  {
    id: "details",
    header: dm.auditColDetails,
    cell: (entry) => <AuditDetails details={entry.details} />,
  },
];

/** Props for {@link ProjectAuditSection}. */
export interface ProjectAuditSectionProps {
  /** The Project whose trail to show. */
  projectId: string;
}

/**
 * Who changed a Project, and when: its quota, its plan, its Applications and
 * its API-Keys, over the last thirty days, newest first.
 *
 * It answers the question an operator has when a developer says their limit
 * changed without them doing anything. The read is bounded, so when the range
 * holds more than it returned the section says how many it shows.
 *
 * @param props - See {@link ProjectAuditSectionProps}.
 * @returns The audit trail section.
 */
export function ProjectAuditSection({ projectId }: ProjectAuditSectionProps) {
  const { data, isPending, isError, error } = useProjectAudit(projectId);

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header
        icon={<ClockCounterClockwiseIcon weight="duotone" className="size-4" />}
        title={dm.projectAuditTitle}
      />
      <DashboardSection.Body flush>
        {isPending && <p className="px-4 py-3 text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>}
        {isError && (
          <p role="alert" className="px-4 py-3 text-sm text-[var(--ds-danger-text)]">
            {dm.projectAuditUnavailable} {describeRequestFailure(error, messages.common.errorId)}
          </p>
        )}
        {data && (
          <>
            <DataTable columns={AUDIT_COLUMNS} data={data.entries} getRowKey={(entry) => entry.id}>
              <DataTable.Empty>
                <p className="px-4 py-3 text-sm text-[var(--ds-text-muted)]">{dm.projectAuditEmpty}</p>
              </DataTable.Empty>
              <DataTable.Viewport>
                <DataTable.Head />
                <DataTable.Rows />
              </DataTable.Viewport>
            </DataTable>
            {data.truncated && (
              <p className="px-4 py-3 text-xs text-[var(--ds-text-muted)]">
                {dm.projectAuditTruncated.replace("{count}", String(data.entries.length))}
              </p>
            )}
          </>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
