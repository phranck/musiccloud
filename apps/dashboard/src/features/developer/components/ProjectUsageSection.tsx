import { UsageChart } from "@musiccloud/dashboard-ui";
import { isNeverCalled, usageChartLabel, usageShare } from "@musiccloud/shared";
import { ChartLine as ChartLineIcon } from "@phosphor-icons/react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { useProjectUsage } from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

/**
 * One window's usage against what the plan grants, worded and measured by the
 * shared `usageShare`, so it reads exactly as the developer portal's usage page.
 *
 * A window without a granted limit shows its count and no bar. The bar is
 * clamped at full whilst the label still reports the real figures, because a
 * bar cannot show more than full and the numbers should.
 */
function UsageWindow({ label, used, granted }: { label: string; used: number; granted: number | null }) {
  const { label: figures, percent, exhausted } = usageShare(used, granted);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--ds-text-muted)]">{label}</span>
        <span className={`text-sm tabular-nums ${exhausted ? "text-amber-400" : "text-[var(--ds-text)]"}`}>
          {figures}
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

  const neverCalled = data !== undefined && isNeverCalled(data);

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
              <UsageChart points={data.range.buckets} bucket={data.range.bucket} label={usageChartLabel(data)} />
            )}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
