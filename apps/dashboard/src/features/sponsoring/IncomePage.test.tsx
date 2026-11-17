import { type DonationTotals, fundingProgress, SPONSORING_DEFAULTS } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTotals: vi.fn(),
  fetchConfig: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchDonationTotals: mocks.fetchTotals,
  fetchSponsoringConfig: mocks.fetchConfig,
}));

vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));

import { dashboardCopy } from "@/copy/dashboard";
import { fundingSentence, IncomePage, incomeChartPoints, incomeSplitPoints, routeRows } from "./IncomePage";

const sm = dashboardCopy.sponsoring;

/** 120 euros over the year: 100 by bank transfer, 80 of it from a sponsor, 20 by PayPal, 20 of it in the last 30 days. */
const TOTALS: DonationTotals = {
  donatedYearCents: 12_000,
  donatedMonthCents: 2_000,
  byMonth: [
    { month: "2026-10", byProvider: { "bank-transfer": 10_000 }, sponsoredCents: 8_000 },
    { month: "2026-11", byProvider: { paypal: 2_000 }, sponsoredCents: 0 },
  ],
  byProvider: { "bank-transfer": 10_000, paypal: 2_000 },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IncomePage />
    </QueryClientProvider>,
  );
}

describe("incomeChartPoints", () => {
  it("starts each month's step on its first day in UTC and sums its routes", () => {
    expect(incomeChartPoints(TOTALS.byMonth)).toEqual([
      { startedAt: "2026-10-01T00:00:00.000Z", total: 10_000, parts: { "bank-transfer": 10_000 } },
      { startedAt: "2026-11-01T00:00:00.000Z", total: 2_000, parts: { paypal: 2_000 } },
    ]);
  });
});

describe("incomeSplitPoints", () => {
  it("splits each month into its sponsored part and the free donations, which add up to the month", () => {
    const points = incomeSplitPoints(TOTALS.byMonth);

    expect(points).toEqual([
      { startedAt: "2026-10-01T00:00:00.000Z", total: 10_000, parts: { sponsored: 8_000, free: 2_000 } },
      { startedAt: "2026-11-01T00:00:00.000Z", total: 2_000, parts: { sponsored: 0, free: 2_000 } },
    ]);
    for (const point of points) {
      expect(Object.values(point.parts ?? {}).reduce((sum, cents) => sum + (cents ?? 0), 0)).toBe(point.total);
    }
  });
});

describe("routeRows", () => {
  it("gives each route that brought something its share of the year", () => {
    expect(routeRows(TOTALS.byProvider)).toEqual([
      { provider: "bank-transfer", cents: 10_000, share: 10_000 / 12_000 },
      { provider: "paypal", cents: 2_000, share: 2_000 / 12_000 },
    ]);
  });

  it("has no rows when nothing came in", () => {
    expect(routeRows({})).toEqual([]);
  });
});

describe("fundingSentence", () => {
  it("names what is missing while the year is not carried", () => {
    expect(fundingSentence(23_000, 12_000, fundingProgress(23_000, 12_000))).toBe(
      "€120 of €230 came in. €110 is still missing.",
    );
  });

  it("says the year is carried once more came in than it costs", () => {
    expect(fundingSentence(10_000, 12_000, fundingProgress(10_000, 12_000))).toBe(
      "€120 came in, which carries the annual cost of €100.",
    );
  });

  it("says there is nothing to measure against without running costs", () => {
    expect(fundingSentence(0, 12_000, fundingProgress(0, 12_000))).toBe(sm.fundingNoCosts);
  });
});

describe("IncomePage", () => {
  beforeEach(() => {
    mocks.fetchTotals.mockReset();
    mocks.fetchConfig.mockReset();
    mocks.fetchTotals.mockResolvedValue(TOTALS);
    mocks.fetchConfig.mockResolvedValue({ ...SPONSORING_DEFAULTS, costs: [{ label: "Hosting", amountCents: 23_000 }] });
  });

  it("measures the year's donations against the stored running costs", async () => {
    renderPage();

    expect(await screen.findByText("€120 of €230 came in. €110 is still missing.")).not.toBeNull();
    expect(screen.getByRole("meter", { name: sm.fundingBarLabel }).getAttribute("value")).toBe("52");
    expect(screen.getByText("Last 30 days: €20.")).not.toBeNull();
  });

  it("draws the split chart with sponsoring and free donations in its legend", async () => {
    renderPage();

    expect(await screen.findByText(sm.splitTitle)).not.toBeNull();
    expect(screen.getByText(sm.splitSponsored)).not.toBeNull();
    expect(screen.getByText(sm.splitFree)).not.toBeNull();
  });

  it("lists each route with its amount and share", async () => {
    renderPage();

    // The chart's legend names the routes as well, so the table is found by its figures.
    expect(await screen.findByText("83%")).not.toBeNull();
    expect(screen.getByText("17%")).not.toBeNull();
    expect(screen.getByText("€100")).not.toBeNull();
  });
});
