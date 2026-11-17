/**
 * @file Who carries the running costs right now, `GET /api/v1/sponsors`.
 *
 * Ported from lmaa.space's `GET /api/sponsors` (`apps/backend/src/routes/public.ts`).
 * The amounts never leave the server: what a person gave is needed to say
 * whether the year is covered, and for nothing else, because an amount printed
 * beside a name turns a list of people into a ranking. The year's sums are the
 * same ones the support page's variables state.
 *
 * Public without a key, because the support page's wall reads it, and kept out
 * of the developer reference (`hide`), because it is not part of the API
 * offered to developers. The global per-source rate limit applies. The answer
 * does not vary by caller, so it is cached publicly for a minute.
 */

import { deriveSupportAmounts, ENDPOINTS, type SponsorsPayload } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { readDonationTotals } from "../services/donations.js";
import { getSponsoringConfig } from "../services/sponsoring-config.js";
import { listCurrentSponsors } from "../services/sponsors.js";

/** A sponsor entered in the dashboard reaches the site within a minute. */
const SPONSORS_CACHE_CONTROL = "public, max-age=60";

/**
 * Registers the route at the root scope, outside every auth hook.
 *
 * @param app - The root Fastify instance.
 */
export default async function publicSponsorRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.sponsors, { schema: { hide: true } }, async (_request, reply) => {
    const [sponsors, config, totals] = await Promise.all([
      listCurrentSponsors(),
      getSponsoringConfig(),
      readDonationTotals(),
    ]);

    // Every payment counts towards the year, whatever route it took and whether
    // or not it earned a sponsorship: the costs are carried by the money rather
    // than by the mention.
    const payload: SponsorsPayload = {
      sponsors,
      costsTotalCents: deriveSupportAmounts(config).annualCostCents,
      coveredCents: totals.donatedYearCents,
      donatedMonthCents: totals.donatedMonthCents,
      minAmountCents: config.sponsorMinimumCents,
    };

    return reply.header("Cache-Control", SPONSORS_CACHE_CONTROL).send(payload);
  });
}
