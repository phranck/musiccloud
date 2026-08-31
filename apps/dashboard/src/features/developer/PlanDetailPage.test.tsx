import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTiers: vi.fn(),
  fetchPlanOffers: vi.fn(),
  updateTier: vi.fn(),
  fetchCreemProducts: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchTiers: mocks.fetchTiers,
  fetchPlanOffers: mocks.fetchPlanOffers,
  updateTier: mocks.updateTier,
  fetchCreemProducts: mocks.fetchCreemProducts,
}));

import { dashboardCopy } from "@/copy/dashboard";
import type { TierOffer, TierResponse } from "@/features/developer/api";
import { PlanDetailPage } from "./PlanDetailPage";

const dm = dashboardCopy.developer;

function makePlan(overrides: Partial<TierResponse> = {}): TierResponse {
  return {
    id: "tier_club",
    name: "Club",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "A plan",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: ["One", "Two"],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeOffer(billingPeriod: string): TierOffer {
  return {
    id: `offer_${billingPeriod}`,
    tierId: "tier_club",
    billingPeriod: billingPeriod as TierOffer["billingPeriod"],
    priceCents: 990,
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

function renderPage(id = "tier_club") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/developer/plans/${id}`]}>
        <Routes>
          <Route path="/developer/plans/:id" element={<PlanDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.fetchTiers.mockResolvedValue([makePlan()]);
  mocks.fetchPlanOffers.mockResolvedValue([]);
  mocks.fetchCreemProducts.mockResolvedValue({ writableModes: ["test"], products: [] });
  mocks.updateTier.mockResolvedValue(makePlan());
});

describe("PlanDetailPage", () => {
  it("shows the plan's own fields, its limits and its features", async () => {
    renderPage();

    expect(await screen.findByLabelText(dm.colName)).toHaveValue("Club");
    expect(screen.getByLabelText(dm.detailRateLimitMinute)).toHaveValue(60);
    expect(screen.getByDisplayValue("One")).not.toBeNull();
  });

  it("says so plainly when the plan is not there", async () => {
    mocks.fetchTiers.mockResolvedValue([]);

    renderPage("tier_gone");

    expect(await screen.findByText(dm.planNotFound)).not.toBeNull();
  });

  it("saves what was edited and nothing else", async () => {
    renderPage();

    const name = await screen.findByLabelText(dm.colName);
    await userEvent.clear(name);
    await userEvent.type(name, "Arena");
    await userEvent.click(screen.getByText(dashboardCopy.common.save));

    await waitFor(() => expect(mocks.updateTier.mock.calls[0]?.[0]).toBe("tier_club"));
    expect(mocks.updateTier.mock.calls[0]?.[1]?.name).toBe("Arena");
    expect(mocks.updateTier.mock.calls[0]?.[1]?.features).toEqual(["One", "Two"]);
  });

  it("refuses to save a colour that is not six hex digits", async () => {
    renderPage();

    const color = await screen.findByLabelText(dm.colColor);
    await userEvent.clear(color);
    await userEvent.type(color, "blue");

    expect(screen.getByText(dm.planColorInvalid)).not.toBeNull();
    await userEvent.click(screen.getByText(dashboardCopy.common.save));
    expect(mocks.updateTier).not.toHaveBeenCalled();
  });

  it("carries the offers card and the Creem card, each reading the same offers", async () => {
    mocks.fetchPlanOffers.mockResolvedValue([makeOffer("every-month")]);

    renderPage();

    expect(await screen.findByText(dm.offersTitle)).not.toBeNull();
    expect(screen.getByText(dm.creemTitle)).not.toBeNull();
    // One offer, so the Creem card shows exactly one row rather than two
    // periods nobody chose.
    expect(await screen.findAllByText(dm.creemNoProduct)).toHaveLength(1);
  });

  it("shows no Creem row at all for a plan that sells nothing", async () => {
    renderPage();

    expect(await screen.findByText(dm.creemNoOffers)).not.toBeNull();
  });
});
