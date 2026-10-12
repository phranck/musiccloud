/**
 * Public tier listing for the Developer Portal pricing page (MC-092).
 * It is unguarded, because the pricing page is public.
 */
import { ENDPOINTS, type PublicTier } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";
import { isFreeTier, isSelfServiceAssignableTier } from "../services/signup-tier.js";
import { enrichTiersWithCreemPrices } from "../services/tier-pricing.js";

export default async function publicTiersRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.tiers,
    {
      schema: {
        tags: ["Plans"],
        summary: "List public API plans",
        description:
          "Returns every public musiccloud API plan in ascending `sortOrder`, including rolling request limits, current display prices, selection availability, and feature labels. `requestsPerMinute` applies to a rolling `60`-second window and `requestsPerDay` to a rolling `24`-hour window. Prices are decimal euro strings rather than floating-point numbers; use `null` to detect billing intervals that are not offered, and `free` to tell a free plan from one sold over another interval.",
        response: {
          200: {
            description: "Public API plans in pricing-page display order.",
            type: "array",
            items: { $ref: "PublicTier#" },
          },
        },
      },
    },
    async () => {
      const repo = await getTierRepository();
      const [tiers, offers] = await Promise.all([repo.listTiers(), repo.listAllOffers()]);
      const priced = await enrichTiersWithCreemPrices(tiers, offers);
      // Whether a plan is free and whether a developer may choose it are
      // decided in one place, and the catalogue carries both answers so the
      // pricing page and the plan step do not each work them out again.
      return priced.map(
        (tier): PublicTier => ({
          ...tier,
          free: isFreeTier(tier, offers),
          selfServiceAssignable: isSelfServiceAssignableTier(tier, offers),
        }),
      );
    },
  );
}
