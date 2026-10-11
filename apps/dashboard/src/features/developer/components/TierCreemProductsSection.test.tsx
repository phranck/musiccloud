import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCreemProducts: vi.fn(),
  createCreemProduct: vi.fn(),
  updateCreemProductPrice: vi.fn(),
  archiveCreemProduct: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchCreemProducts: mocks.fetchCreemProducts,
  createCreemProduct: mocks.createCreemProduct,
  updateCreemProductPrice: mocks.updateCreemProductPrice,
  archiveCreemProduct: mocks.archiveCreemProduct,
}));

import { dashboardCopy } from "@/copy/dashboard";
import type { TierOffer, TierResponse } from "@/features/developer/api";
import { TierCreemProductsSection } from "./TierCreemProductsSection";

const dm = dashboardCopy.developer;

/** A plan sold monthly but not yearly, which every case varies from. */
function makeTier(overrides: Partial<TierResponse> = {}): TierResponse {
  return {
    id: "tier_club",
    name: "Club",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: "9.90",
    priceYearly: null,
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
    ...overrides,
  };
}

/** One offer of the plan. Every row of the section corresponds to one. */
function makeOffer(billingPeriod: string, priceCents = 990): TierOffer {
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

function renderSection(offers: TierOffer[] = [makeOffer("every-month")], tier: TierResponse = makeTier()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TierCreemProductsSection tier={tier} offers={offers} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

/** The default answer: this backend holds a sandbox key and nothing is mapped. */
function withNoProducts() {
  mocks.fetchCreemProducts.mockResolvedValue({ writableModes: ["test"], products: [] });
}

describe("TierCreemProductsSection", () => {
  it("shows the product id of the environment on show", async () => {
    mocks.fetchCreemProducts.mockResolvedValue({
      writableModes: ["test"],
      products: [
        { tierId: "tier_club", billingPeriod: "every-month", mode: "test", creemProductId: "prod_sandbox" },
        { tierId: "tier_club", billingPeriod: "every-month", mode: "live", creemProductId: "prod_live" },
      ],
    });

    renderSection();

    expect(await screen.findByText("prod_sandbox")).not.toBeNull();
    expect(screen.queryByText("prod_live")).toBeNull();
  });

  it("switches to the other environment and shows that one's product instead", async () => {
    mocks.fetchCreemProducts.mockResolvedValue({
      writableModes: ["test"],
      products: [
        { tierId: "tier_club", billingPeriod: "every-month", mode: "test", creemProductId: "prod_sandbox" },
        { tierId: "tier_club", billingPeriod: "every-month", mode: "live", creemProductId: "prod_live" },
      ],
    });

    renderSection();
    await screen.findByText("prod_sandbox");
    await userEvent.click(screen.getByText(dm.creemEnvironmentLive));

    expect(await screen.findByText("prod_live")).not.toBeNull();
    expect(screen.queryByText("prod_sandbox")).toBeNull();
  });

  it("offers no action in an environment this deployment has no key for", async () => {
    mocks.fetchCreemProducts.mockResolvedValue({
      writableModes: ["test"],
      products: [{ tierId: "tier_club", billingPeriod: "every-month", mode: "live", creemProductId: "prod_live" }],
    });

    renderSection();
    await userEvent.click(await screen.findByText(dm.creemEnvironmentLive));

    expect(screen.queryByText(dm.creemArchive)).toBeNull();
    expect(screen.queryByText(dm.creemCreate)).toBeNull();
    expect(screen.getByText(dm.creemNoKeyForEnvironment.replaceAll("{mode}", dm.creemEnvironmentLive))).not.toBeNull();
  });

  it("shows one row per offer and nothing for a plan that sells nothing", async () => {
    withNoProducts();
    const { unmount } = renderSection([makeOffer("every-month"), makeOffer("every-year")]);

    expect(await screen.findAllByText(dm.creemNoProduct)).toHaveLength(2);
    unmount();

    withNoProducts();
    renderSection([]);
    expect(await screen.findByText(dm.creemNoOffers)).not.toBeNull();
  });

  it("creates the product for the plan and interval", async () => {
    withNoProducts();
    renderSection();

    await userEvent.click(await screen.findByText(dm.creemCreate));

    // Only the first argument: react-query hands the mutation function a
    // context object as its second, which says nothing about this call.
    await waitFor(() =>
      expect(mocks.createCreemProduct.mock.calls[0]?.[0]).toEqual({
        tierId: "tier_club",
        billingPeriod: "every-month",
        mode: "test",
      }),
    );
  });

  it("asks before archiving, because Creem keeps the product forever", async () => {
    mocks.fetchCreemProducts.mockResolvedValue({
      writableModes: ["test"],
      products: [{ tierId: "tier_club", billingPeriod: "every-month", mode: "test", creemProductId: "prod_sandbox" }],
    });

    renderSection();
    await userEvent.click(await screen.findByText(dm.creemArchive));

    expect(screen.getByText(dm.creemArchiveConfirmBody)).not.toBeNull();
    expect(mocks.archiveCreemProduct).not.toHaveBeenCalled();

    const [confirm] = screen.getAllByText(dm.creemArchive);
    await userEvent.click(confirm as HTMLElement);

    await waitFor(() => expect(mocks.archiveCreemProduct).toHaveBeenCalledWith("tier_club", "every-month", "test"));
  });
});
