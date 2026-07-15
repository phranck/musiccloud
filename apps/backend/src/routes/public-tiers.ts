/**
 * Public tier listing for the Developer Portal pricing page (MC-092).
 * Unguarded — the pricing page is public.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";
import { enrichTiersWithCreemPrices } from "../services/tier-pricing.js";

export default async function publicTiersRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.tiers,
    {
      schema: {
        tags: ["Plans"],
        summary: "List public API plans",
        description:
          "Returns every public musiccloud API plan in ascending `sortOrder`, including rolling request limits, current display prices, selection availability, and feature labels. `requestsPerMinute` applies to a rolling `60`-second window and `requestsPerDay` to a rolling `24`-hour window. Prices are decimal euro strings rather than floating-point numbers; use `null` to detect billing intervals that are not offered.",
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
      return enrichTiersWithCreemPrices(await repo.listTiers());
    },
  );
}
