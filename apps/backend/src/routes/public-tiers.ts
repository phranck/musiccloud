/**
 * Public tier listing for the Developer Portal pricing page (MC-092).
 * Unguarded — the pricing page is public.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";

export default async function publicTiersRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.tiers, async () => {
    const repo = await getTierRepository();
    return repo.listTiers();
  });
}
