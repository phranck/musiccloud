/**
 * Route tests for `GET /api/v1/sponsors`, with the sponsors, the sponsoring
 * settings and the ledger's sums mocked.
 */
import { ENDPOINTS, type PublicSponsor, parseSponsoringConfig } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A published sponsor whose year runs, as the service returns them. */
const ADA: PublicSponsor = {
  id: "s1",
  name: "Ada",
  socialMedia: [{ platform: "mastodon", url: "https://chaos.social/@ada" }],
  avatarId: null,
  claim: "Music for everybody.",
  paidOn: "2026-11-07",
};

vi.mock("../services/sponsors.js", () => ({
  listCurrentSponsors: vi.fn(async () => [ADA]),
}));

vi.mock("../services/sponsoring-config.js", () => ({
  getSponsoringConfig: vi.fn(async () =>
    parseSponsoringConfig(
      JSON.stringify({
        costs: [
          { label: "Server", amountCents: 60_000 },
          { label: "Domain", amountCents: 2_000 },
        ],
        sponsorMinimumCents: 4_000,
      }),
    ),
  ),
}));

vi.mock("../services/donations.js", () => ({
  readDonationTotals: vi.fn(async () => ({
    donatedYearCents: 31_000,
    donatedMonthCents: 5_000,
    byMonth: [],
    byProvider: {},
  })),
}));

let app: FastifyInstance;

beforeEach(async () => {
  app = Fastify({ logger: false });
  const { default: publicSponsorRoutes } = await import("./public-sponsors.js");
  await app.register(publicSponsorRoutes);
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/v1/sponsors", () => {
  it("answers the current sponsors with the year's figures, cached publicly for a minute", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.sponsors });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.json()).toEqual({
      sponsors: [ADA],
      costsTotalCents: 62_000,
      coveredCents: 31_000,
      donatedMonthCents: 5_000,
      minAmountCents: 4_000,
    });
  });

  it("carries no amount belonging to a person", async () => {
    const res = await app.inject({ method: "GET", url: ENDPOINTS.v1.sponsors });

    for (const sponsor of res.json().sponsors) {
      expect(Object.keys(sponsor).sort()).toEqual(["avatarId", "claim", "id", "name", "paidOn", "socialMedia"]);
    }
    expect(res.body).not.toContain("amountCents");
    expect(res.body).not.toContain("published");
  });
});
