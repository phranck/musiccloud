import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicTier } from "@/lib/tiers";

const mocks = vi.hoisted(() => ({ fetchPublicTiers: vi.fn() }));

vi.mock("@/lib/tiers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tiers")>()),
  fetchPublicTiers: mocks.fetchPublicTiers,
}));

import PlanGrid from "./PlanGrid.astro";

/** A plan as the catalogue serves it, free and choosable unless told otherwise. */
function makeTier(overrides: Partial<PublicTier> = {}): PublicTier {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
    free: true,
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    selfServiceAssignable: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: [],
    ...overrides,
  };
}

/** Renders the grid for exactly one plan, so everything in it belongs to that card. */
async function renderCard(tier: PublicTier): Promise<string> {
  mocks.fetchPublicTiers.mockResolvedValue([tier]);
  const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
  return container.renderToString(PlanGrid);
}

beforeEach(() => {
  mocks.fetchPublicTiers.mockReset();
});

describe("PlanGrid", () => {
  it("calls a free plan free and offers it", async () => {
    const html = await renderCard(makeTier());

    expect(html).toContain("Free");
    expect(html).toContain('href="/signup?tier=tier_free"');
    expect(html).not.toContain("Not available yet");
  });

  it("does not call a plan sold only yearly free, and shows its yearly price", async () => {
    const html = await renderCard(
      makeTier({
        id: "tier_annual",
        name: "Annual",
        priceYearly: "90",
        free: false,
        selfServiceAssignable: false,
      }),
    );

    expect(html).not.toContain("Free");
    expect(html).toContain("€90");
    expect(html).toContain("Not available yet");
  });

  it("says paid plan for a plan sold over neither headline period", async () => {
    const html = await renderCard(
      makeTier({ id: "tier_quarterly", name: "Quarterly", free: false, selfServiceAssignable: false }),
    );

    expect(html).toContain("Paid plan");
    expect(html).not.toContain("Free");
  });
});
