import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPlanOffer: vi.fn(),
  updatePlanOffer: vi.fn(),
  deletePlanOffer: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  createPlanOffer: mocks.createPlanOffer,
  updatePlanOffer: mocks.updatePlanOffer,
  deletePlanOffer: mocks.deletePlanOffer,
}));

import { dashboardCopy } from "@/copy/dashboard";
import type { TierOffer } from "@/features/developer/api";
import { PlanOffersSection } from "./PlanOffersSection";

const dm = dashboardCopy.developer;

/** One offer, which every case varies from. */
function makeOffer(overrides: Partial<TierOffer> = {}): TierOffer {
  return {
    id: "offer_1",
    tierId: "tier_club",
    billingPeriod: "every-month",
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
    ...overrides,
  };
}

function renderSection(offers: TierOffer[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanOffersSection tierId="tier_club" offers={offers} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createPlanOffer.mockResolvedValue(makeOffer());
  mocks.updatePlanOffer.mockResolvedValue(makeOffer());
});

describe("PlanOffersSection", () => {
  it("says a plan sells nothing rather than inventing a period", async () => {
    renderSection([]);

    expect(screen.getByText(dm.offersNone)).not.toBeNull();
  });

  it("shows the stored amount in the price field, so an edit starts from it", () => {
    renderSection([makeOffer({ priceCents: 1450 })]);

    expect(screen.getByLabelText(dm.offerPrice)).toHaveValue("14.50");
  });

  it("sends the amount in cents when it has changed", async () => {
    renderSection([makeOffer({ priceCents: 990 })]);

    await userEvent.clear(screen.getByLabelText(dm.offerPrice));
    await userEvent.type(screen.getByLabelText(dm.offerPrice), "14.50");
    await userEvent.click(screen.getByText(dashboardCopy.common.save));

    await waitFor(() =>
      expect(mocks.updatePlanOffer.mock.calls[0]?.slice(0, 2)).toEqual(["offer_1", { priceCents: 1450 }]),
    );
  });

  it("refuses an amount below what Creem accepts, and says so before it is sent", async () => {
    renderSection([makeOffer()]);

    await userEvent.clear(screen.getByLabelText(dm.offerPrice));
    await userEvent.type(screen.getByLabelText(dm.offerPrice), "0.50");

    expect(screen.getByText(dm.offerPriceInvalid)).not.toBeNull();
    await userEvent.click(screen.getByText(dashboardCopy.common.save));
    expect(mocks.updatePlanOffer).not.toHaveBeenCalled();
  });

  it("adds an offer over a period the plan does not already sell", async () => {
    renderSection([makeOffer({ billingPeriod: "every-month" })]);

    await userEvent.click(screen.getByText(dm.offersAdd));

    await waitFor(() => expect(mocks.createPlanOffer.mock.calls[0]?.[0]).toBe("tier_club"));
    // "once" comes first in Creem's own order and is the first period free.
    expect(mocks.createPlanOffer.mock.calls[0]?.[1]?.billingPeriod).toBe("once");
  });

  it("offers nothing to add once every period is sold", () => {
    const periods = ["once", "every-day", "every-month", "every-three-months", "every-six-months", "every-year"];
    renderSection(periods.map((period, index) => makeOffer({ id: `offer_${index}`, billingPeriod: period as never })));

    expect(screen.getByText(dm.offersAdd).closest("button")).toBeDisabled();
  });

  it("asks before removing an offer, because it takes the Creem mapping with it", async () => {
    renderSection([makeOffer()]);

    await userEvent.click(screen.getByText(dm.offerRemove));

    expect(screen.getByText(dm.offerRemoveConfirm)).not.toBeNull();
    expect(mocks.deletePlanOffer).not.toHaveBeenCalled();

    const [confirm] = screen.getAllByText(dm.offerRemove);
    await userEvent.click(confirm as HTMLElement);

    // Only the first argument: react-query hands the mutation function a
    // context object as its second, which says nothing about this call.
    await waitFor(() => expect(mocks.deletePlanOffer.mock.calls[0]?.[0]).toBe("offer_1"));
  });

  it("lets the customer name the amount on a one-off offer only", async () => {
    const { unmount } = renderSection([makeOffer({ billingPeriod: "every-month" })]);
    // The field sits behind the disclosure, with everything else Creem accepts
    // that nobody changes twice a year.
    await userEvent.click(screen.getByText(dm.offerMore));
    expect(screen.getByLabelText(dm.offerPayWhatYouWant)).toBeDisabled();
    expect(screen.getByText(dm.offerPayWhatYouWantHint)).not.toBeNull();
    unmount();

    renderSection([makeOffer({ billingPeriod: "once" })]);
    await userEvent.click(screen.getByText(dm.offerMore));
    expect(screen.getByLabelText(dm.offerPayWhatYouWant)).not.toBeDisabled();
  });
});
