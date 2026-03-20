import { ChartBarIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useI18n } from "@/context/I18nContext";
import { type UmamiPageView, useUmamiPageViews, useUmamiStats } from "@/features/analytics/hooks/useUmamiStats";
import { useAuth } from "@/features/auth/AuthContext";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";

type Period = "24h" | "7d" | "30d" | "90d";

function KpiCard({ label, value, prev }: { label: string; value: number; prev: number }) {
  const { formatNumber } = useI18n();
  const change = prev > 0 ? ((value - prev) / prev) * 100 : null;
  const trendArrow = change === null ? "\u2192" : change >= 0 ? "\u2191" : "\u2193";
  const trendText = change === null ? "\u2014" : `${Math.abs(change).toFixed(1)}%`;
  const trendIsGood = change !== null && change >= 0;
  const trendTone =
    change === null
      ? "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-subtle)]"
      : trendIsGood
        ? "bg-[var(--ds-badge-success-bg)] text-[var(--ds-badge-success-text)]"
        : "bg-[var(--ds-badge-danger-bg)] text-[var(--ds-badge-danger-text)]";

  return (
    <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] shadow-sm px-4 py-3">
      <p className="text-sm text-[var(--ds-text-subtle)] mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold text-[var(--ds-text)]">{formatNumber(value)}</p>
        <p
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums ${trendTone}`}
        >
          <span aria-hidden="true">{trendArrow}</span>
          <span>{trendText}</span>
        </p>
      </div>
    </div>
  );
}

function PageViewList({ views }: { views: UmamiPageView[] }) {
  const { formatNumber } = useI18n();
  const max = views[0]?.views ?? 1;

  return (
    <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] shadow-sm p-4">
      <p className="text-base font-medium text-[var(--ds-text)] mb-3">Top Pages</p>
      {views.length === 0 ? (
        <p className="text-sm text-[var(--ds-text-subtle)] py-4 text-center">No data</p>
      ) : (
        <ul className="space-y-2">
          {views.slice(0, 15).map((pv) => (
            <li key={pv.path} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate text-[var(--ds-text-muted)]" title={pv.path}>
                {pv.path === "/" ? "Home" : pv.path}
              </span>
              <div className="w-20 h-1.5 bg-[var(--ds-bg-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{ width: `${Math.round((pv.views / max) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 w-10 text-right text-sm text-[var(--ds-text-muted)]">
                {formatNumber(pv.views)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AnalyticsPage() {
  const { user } = useAuth();
  const periodOptions = useMemo<{ label: string; value: Period }[]>(
    () => [
      { value: "24h", label: "24h" },
      { value: "7d", label: "7d" },
      { value: "30d", label: "30d" },
      { value: "90d", label: "90d" },
    ],
    [],
  );
  const [period, setPeriod] = useState<Period>("7d");
  const { data: stats, isLoading: statsLoading } = useUmamiStats(period);
  const { data: pageViews = [], isLoading: pvLoading } = useUmamiPageViews(period);

  const hasData = stats && stats.pageviews != null;

  return (
    <PageLayout>
      <PageHeader title="Analytics">
        <SegmentedControl
          value={period}
          onChange={(p) => setPeriod(p as Period)}
          storageKey={getSegmentedStorageKey(user?.id, "analytics:period")}
          options={periodOptions}
        />
      </PageHeader>

      <PageBody className="space-y-4">
        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Array.from({ length: 5 }, (_, i) => `kpi-sk-${i}`).map((k) => (
              <div key={k} className="h-20 bg-[var(--ds-bg-elevated)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : hasData ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiCard label="Pageviews" value={stats.pageviews.value} prev={stats.pageviews.prev} />
            <KpiCard label="Visitors" value={stats.visitors.value} prev={stats.visitors.prev} />
            <KpiCard label="Visits" value={stats.visits.value} prev={stats.visits.prev} />
            <KpiCard label="Bounces" value={stats.bounces.value} prev={stats.bounces.prev} />
            <KpiCard label="Total Time" value={stats.totaltime.value} prev={stats.totaltime.prev} />
          </div>
        ) : (
          <ContentUnavailableView
            icon={<ChartBarIcon weight="duotone" aria-hidden />}
            title="No Analytics Data"
            subtitle="Analytics data is not yet available."
            className="min-h-[16rem]"
          />
        )}

        {!pvLoading && pageViews.length > 0 && <PageViewList views={pageViews} />}
      </PageBody>
    </PageLayout>
  );
}
