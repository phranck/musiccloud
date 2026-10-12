import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchTiers: vi.fn() }));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchTiers: mocks.fetchTiers,
}));

import type { TierOffer } from "@musiccloud/shared";
import { dashboardCopy } from "@/copy/dashboard";
import type { TierListItem } from "@/features/developer/api";
import { formatOfferPrice, periodLabel } from "@/features/developer/offerFormat";
import { TierEditorPage } from "./TierEditorPage";

const dm = dashboardCopy.developer;

/** A plan as the admin list returns it, selling nothing unless given offers. */
function makePlan(overrides: Partial<TierListItem> = {}): TierListItem {
  return {
    id: "tier_starter",
    name: "Starter",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: [],
    createdAt: 0,
    updatedAt: 0,
    offers: [],
    ...overrides,
  };
}

/** One offer of the Club plan. */
function makeOffer(billingPeriod: string, priceCents: number): TierOffer {
  return {
    id: `offer_${billingPeriod}`,
    tierId: "tier_club",
    billingPeriod: billingPeriod as TierOffer["billingPeriod"],
    priceCents,
    currency: "EUR",
    taxMode: null,
    taxCategory: null,
    imageUrl: null,
    successUrl: null,
    customFields: [],
    abandonedCartRecovery: false,
    payWhatYouWant: false,
    suggestedPriceCents: null,
    sortOrder: 0,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TierEditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.fetchTiers.mockReset();
});

describe("TierEditorPage", () => {
  it("prices each plan from its offers, and calls a plan without any free", async () => {
    const monthly = makeOffer("every-month", 990);
    const yearly = makeOffer("every-year", 9900);
    mocks.fetchTiers.mockResolvedValue([
      makePlan(),
      makePlan({ id: "tier_club", name: "Club", sortOrder: 1, offers: [monthly, yearly] }),
    ]);

    renderPage();

    const clubRow = (await screen.findByText("Club")).closest("tr") as HTMLElement;
    expect(
      within(clubRow).getByText(`${periodLabel(monthly.billingPeriod)} ${formatOfferPrice(monthly)}`),
    ).not.toBeNull();
    expect(
      within(clubRow).getByText(`${periodLabel(yearly.billingPeriod)} ${formatOfferPrice(yearly)}`),
    ).not.toBeNull();

    const starterRow = screen.getByText("Starter").closest("tr") as HTMLElement;
    expect(within(starterRow).getByText(dm.tierFree)).not.toBeNull();
  });
});
