import { UsageSparkline } from "@musiccloud/dashboard-ui";
import { ChartLine as ChartLineIcon } from "@phosphor-icons/react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { useProjectUsage } from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/**
 * One window's usage against what the plan grants.
 *
 * A project whose plan grants nothing has no denominator, and saying so beats
 * dividing by a number that does not exist. The bar is clamped at full whilst
 * the label still reports the real figures, because a bar cannot show more
 * than full and the numbers should.
 */
function UsageWindow({ label, used, granted }: { label: string; used: number; granted: number | null }) {
  const percent = granted === null || granted <= 0 ? null : Math.min(Math.round((used / granted) * 100), 100);
  const exhausted = granted !== null && granted > 0 && used >= granted;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--ds-text-muted)]">{label}</span>
        <span className={`text-sm tabular-nums ${exhausted ? "text-amber-400" : "text-[var(--ds-text)]"}`}>
          {granted === null
            ? `${NUMBER_FORMAT.format(used)} · ${dm.usageNoLimit}`
            : `${NUMBER_FORMAT.format(used)} / ${NUMBER_FORMAT.format(granted)}`}
        </span>
      </div>
      {percent !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ds-border)]">
          <div className="h-full rounded-full bg-[var(--ds-accent)]" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * Props for {@link ProjectUsageSection}.
 */
export interface ProjectUsageSectionProps {
  /** The project to report on. */
  projectId: string;
}

/**
 * What one project has actually spent of its quota.
 *
 * An operator answering "why is this developer being throttled" sees the same
 * two windows the API enforces and the same figures the developer sees in the
 * portal, because both read the one report.
 *
 * Three states are kept apart on purpose: loading, a read that failed, and a
 * project that has simply never been called. The last one is not a fault and
 * does not read as one.
 *
 * @param props - See {@link ProjectUsageSectionProps}.
 * @returns The usage section.
 */
export function ProjectUsageSection({ projectId }: ProjectUsageSectionProps) {
  const { data, isLoading, isError } = useProjectUsage(projectId);

  const neverCalled = data !== undefined && data.windows.day.total === 0 && data.range.total === 0;

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header
        icon={<ChartLineIcon weight="duotone" className="size-4" />}
        title={dm.projectUsageTitle}
      />
      <DashboardSection.Body>
        {isLoading && <p className="text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>}
        {isError && <p className="text-sm text-red-400">{dm.projectUsageUnavailable}</p>}
        {data && (
          <div className="flex flex-col gap-4">
            <UsageWindow
              label={dm.projectUsageMinute}
              used={data.windows.minute.total}
              granted={data.quota.requestsPerMinute}
            />
            <UsageWindow label={dm.projectUsageDay} used={data.windows.day.total} granted={data.quota.requestsPerDay} />
            {neverCalled ? (
              <p className="text-xs text-[var(--ds-text-muted)]">{dm.projectUsageNeverCalled}</p>
            ) : (
              <div className="text-[var(--ds-accent)]">
                <UsageSparkline
                  points={data.range.buckets}
                  label={`${data.range.total} requests between ${data.range.from} and ${data.range.to}`}
                />
              </div>
            )}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
