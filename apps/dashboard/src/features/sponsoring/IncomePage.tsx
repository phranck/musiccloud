import {
  type ColumnDef,
  DataTable,
  DataTableScroll,
  UsageChart,
  UsageChartBucket,
  type UsageChartPoint,
  type UsageChartSeries,
} from "@musiccloud/dashboard-ui";
import {
  DONATION_PROVIDERS,
  type DonationProviderValue,
  type DonationTotals,
  deriveSupportAmounts,
  type FundingProgress,
  formatEuroCents,
  fundingProgress,
} from "@musiccloud/shared";
import { ChartBarIcon, SignpostIcon, TargetIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import {
  DONATION_TOTALS_QUERY_KEY,
  fetchDonationTotals,
  fetchSponsoringConfig,
  SPONSORING_CONFIG_QUERY_KEY,
} from "@/features/sponsoring/api";

const sm = dashboardCopy.sponsoring;

/** What turns a ledger month, `YYYY-MM`, into the ISO moment the chart's month step begins at. */
const MONTH_START_SUFFIX = "-01T00:00:00.000Z";

/** The chart's drawing height in pixels: 220, a little above the usage chart's, for the legend beneath. */
const INCOME_CHART_HEIGHT = 220;

/** The highest value the funding meter reports: 100 percent. */
const METER_MAX = 100;

/** A share of the year's income, as a whole percent. */
const SHARE_FORMAT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

/** The chart's series: one per route, in the ledger's order, bottom first. */
const PROVIDER_SERIES: readonly UsageChartSeries[] = DONATION_PROVIDERS.map((provider) => ({
  key: provider,
  label: sm.provider[provider],
}));

/** One row of the by-route table. */
interface RouteRow {
  /** The route. */
  provider: DonationProviderValue;
  /** What it brought in over the funding year, in cents. */
  cents: number;
  /** Its share of the year's income, 0 to 1. */
  share: number;
}

/** The by-route table's columns. They depend on nothing, so they are built once. */
const ROUTE_COLUMNS: ColumnDef<RouteRow>[] = [
  {
    id: "provider",
    header: sm.colProvider,
    sortKey: (row) => sm.provider[row.provider],
    cell: (row) => sm.provider[row.provider],
  },
  {
    id: "amount",
    header: sm.colAmount,
    className: "w-36",
    sortKey: (row) => row.cents,
    cell: (row) => <span className="tabular-nums">{formatEuroCents(row.cents)}</span>,
  },
  {
    id: "share",
    header: sm.colShare,
    className: "w-24",
    sortKey: (row) => row.share,
    cell: (row) => <span className="tabular-nums">{SHARE_FORMAT.format(row.share)}</span>,
  },
];

/**
 * Adds up a map of sums per route.
 *
 * @param byProvider - Cents per route; a missing route counts as zero.
 * @returns The sum in cents.
 */
function sumCents(byProvider: DonationTotals["byProvider"]): number {
  return Object.values(byProvider).reduce((sum, cents) => sum + (cents ?? 0), 0);
}

/**
 * Turns the ledger's months into the chart's steps.
 *
 * @param byMonth - The sums per calendar month, oldest first.
 * @returns One step per month, its whole income in `total` and its routes in `parts`.
 */
export function incomeChartPoints(byMonth: DonationTotals["byMonth"]): UsageChartPoint[] {
  return byMonth.map(({ month, byProvider }) => ({
    startedAt: `${month}${MONTH_START_SUFFIX}`,
    total: sumCents(byProvider),
    parts: byProvider,
  }));
}

/**
 * Turns the year's sums per route into the table's rows, one for every route
 * that brought something in. The table sorts them.
 *
 * @param byProvider - The funding year's sum per route.
 * @returns The rows; empty when nothing came in.
 */
export function routeRows(byProvider: DonationTotals["byProvider"]): RouteRow[] {
  const total = sumCents(byProvider);
  if (total === 0) return [];
  return DONATION_PROVIDERS.flatMap((provider) => {
    const cents = byProvider[provider] ?? 0;
    return cents > 0 ? [{ provider, cents, share: cents / total }] : [];
  });
}

/**
 * The sentence above the funding meter.
 *
 * @param annualCostCents - What the year costs.
 * @param donatedYearCents - What came in over the funding year.
 * @param progress - The two compared, from `fundingProgress`.
 * @returns What is carried and what is missing, or that there is nothing to measure against.
 */
export function fundingSentence(annualCostCents: number, donatedYearCents: number, progress: FundingProgress): string {
  if (annualCostCents === 0) return sm.fundingNoCosts;
  if (progress.missingCents === 0) {
    return sm.fundingCarried
      .replace("{donated}", formatEuroCents(donatedYearCents))
      .replace("{annual}", formatEuroCents(annualCostCents));
  }
  return sm.fundingMissing
    .replace("{covered}", formatEuroCents(progress.coveredCents))
    .replace("{annual}", formatEuroCents(annualCostCents))
    .replace("{missing}", formatEuroCents(progress.missingCents));
}

/** Props of {@link FundingMeter}. */
interface FundingMeterProps {
  /** The covered share, 0 to 1. */
  ratio: number;
}

/**
 * A bar showing how much of the annual cost the year's donations carry.
 *
 * It is a native `meter` with the share as a whole percentage, because the
 * sentence above it gives the amounts and the bar only their proportion. The
 * `ds-meter` rules in `tokens.css` draw it with the dashboard's tokens.
 *
 * @param props - See {@link FundingMeterProps}.
 * @returns The bar.
 */
function FundingMeter({ ratio }: FundingMeterProps) {
  return (
    <meter
      className="ds-meter"
      aria-label={sm.fundingBarLabel}
      min={0}
      max={METER_MAX}
      value={Math.round(ratio * METER_MAX)}
    />
  );
}

/**
 * What came in: how far the last 365 days carry the annual cost, the income
 * per calendar month stacked by route, and each route's share of the year.
 *
 * Every figure comes from the donations ledger and the stored running costs,
 * through the same `fundingProgress` the support page uses, so this page and
 * the public one cannot disagree about what is missing.
 *
 * @returns The page.
 */
export function IncomePage() {
  const totalsQuery = useQuery({ queryKey: DONATION_TOTALS_QUERY_KEY, queryFn: fetchDonationTotals });
  const configQuery = useQuery({ queryKey: SPONSORING_CONFIG_QUERY_KEY, queryFn: fetchSponsoringConfig });

  if (!totalsQuery.data || !configQuery.data) return <ContentLoadingView />;

  const totals = totalsQuery.data;
  const { annualCostCents } = deriveSupportAmounts(configQuery.data);
  const progress = fundingProgress(annualCostCents, totals.donatedYearCents);
  const routes = routeRows(totals.byProvider);

  return (
    <PageLayout>
      <PageHeader title={sm.incomeTitle} />

      <DashboardSection>
        <DashboardSection.Header icon={<TargetIcon weight="duotone" className="size-4" />} title={sm.fundingTitle} />
        <DashboardSection.Body>
          <p className="text-sm text-[var(--ds-text)]">
            {fundingSentence(annualCostCents, totals.donatedYearCents, progress)}
          </p>
          {annualCostCents > 0 && <FundingMeter ratio={progress.ratio} />}
          <p className="text-xs text-[var(--ds-text-muted)]">
            {sm.fundingLastMonth.replace("{month}", formatEuroCents(totals.donatedMonthCents))}
          </p>
        </DashboardSection.Body>
      </DashboardSection>

      <DashboardSection>
        <DashboardSection.Header icon={<ChartBarIcon weight="duotone" className="size-4" />} title={sm.chartTitle} />
        <DashboardSection.Body>
          <UsageChart
            points={incomeChartPoints(totals.byMonth)}
            bucket={UsageChartBucket.Month}
            label={sm.chartLabel}
            height={INCOME_CHART_HEIGHT}
            series={PROVIDER_SERIES}
            formatValue={formatEuroCents}
          />
        </DashboardSection.Body>
      </DashboardSection>

      <DashboardSection className="overflow-hidden">
        <DashboardSection.Header icon={<SignpostIcon weight="duotone" className="size-4" />} title={sm.routesTitle} />
        {routes.length === 0 ? (
          <DashboardSection.Body>
            <p className="text-sm text-[var(--ds-text-muted)]">{sm.routesEmpty}</p>
          </DashboardSection.Body>
        ) : (
          <DashboardSection.Body flush>
            <DataTable
              columns={ROUTE_COLUMNS}
              data={routes}
              getRowKey={(row) => row.provider}
              defaultSort={{ id: "amount", dir: "desc" }}
            >
              <DataTable.Viewport scroll={DataTableScroll.Ancestor}>
                <DataTable.Head />
                <DataTable.Rows />
              </DataTable.Viewport>
            </DataTable>
          </DashboardSection.Body>
        )}
      </DashboardSection>
    </PageLayout>
  );
}
