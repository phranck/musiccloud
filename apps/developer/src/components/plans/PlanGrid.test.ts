import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";
import type { PublicTier } from "@musiccloud/shared";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePublicTier } from "@/lib/__fixtures__/public-tier";

const mocks = vi.hoisted(() => ({ fetchPublicTiers: vi.fn() }));

vi.mock("@/lib/tiers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tiers")>()),
  fetchPublicTiers: mocks.fetchPublicTiers,
}));

import PlanGrid from "./PlanGrid.astro";

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
    const html = await renderCard(makePublicTier());

    expect(html).toContain("Free");
    expect(html).toContain('href="/signup?tier=tier_free"');
    expect(html).not.toContain("Not available yet");
  });

  it("does not call a plan sold only yearly free, and shows its yearly price", async () => {
    const html = await renderCard(
      makePublicTier({
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
      makePublicTier({ id: "tier_quarterly", name: "Quarterly", free: false, selfServiceAssignable: false }),
    );

    expect(html).toContain("Paid plan");
    expect(html).not.toContain("Free");
  });
});
