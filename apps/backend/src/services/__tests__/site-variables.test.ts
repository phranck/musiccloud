import { beforeEach, describe, expect, it, vi } from "vitest";

const listTiers = vi.fn();
const getMaxProjectsPerAccount = vi.fn();

vi.mock("../../db/index.js", () => ({
  getTierRepository: async () => ({ listTiers }),
}));

vi.mock("../developer-limits.js", async () => {
  const actual = await vi.importActual<typeof import("../developer-limits.js")>("../developer-limits.js");
  return { ...actual, getMaxProjectsPerAccount };
});

const { KEYLESS_RESOLVE_REQUESTS_PER_DAY, KEYLESS_RESOLVE_REQUESTS_PER_MINUTE } = await import(
  "../../lib/infra/rate-limiter.js"
);
const { MAX_REGISTRATIONS_PER_PROJECT } = await import("../developer-limits.js");
const { TIER_FREE_ID } = await import("../signup-tier.js");
const { resolveSiteVariableValues } = await import("../site-variables.js");

/** A free tier carrying figures no constant in the codebase holds, so nothing can pass by luck. */
const FREE_TIER = { id: TIER_FREE_ID, requestsPerMinute: 37, requestsPerDay: 4321, enabled: true };

describe("resolveSiteVariableValues", () => {
  beforeEach(() => {
    listTiers.mockReset();
    getMaxProjectsPerAccount.mockReset();
    listTiers.mockResolvedValue([FREE_TIER]);
    getMaxProjectsPerAccount.mockResolvedValue(7);
  });

  it("takes the free plan's limits from the tier rather than from a figure of its own", async () => {
    const values = await resolveSiteVariableValues();

    expect(values.freeRequestsPerMinute).toBe(FREE_TIER.requestsPerMinute);
    expect(values.freeRequestsPerDay).toBe(FREE_TIER.requestsPerDay);
  });

  it("takes the project ceiling from the setting the operator edits", async () => {
    expect((await resolveSiteVariableValues()).projectsPerAccount).toBe(7);
  });

  it("takes the remaining figures from the modules that enforce them", async () => {
    const values = await resolveSiteVariableValues();

    expect(values.registrationsPerProject).toBe(MAX_REGISTRATIONS_PER_PROJECT);
    expect(values.keylessRequestsPerMinute).toBe(KEYLESS_RESOLVE_REQUESTS_PER_MINUTE);
    expect(values.keylessRequestsPerDay).toBe(KEYLESS_RESOLVE_REQUESTS_PER_DAY);
  });

  it("reports zero rather than a plausible figure when the free plan cannot be read", async () => {
    // Visibly wrong, so a page saying "0 requests a minute" is reported as a
    // fault. A stand-in figure would be read as true and believed.
    listTiers.mockResolvedValue([]);
    const values = await resolveSiteVariableValues();

    expect(values.freeRequestsPerMinute).toBe(0);
    expect(values.freeRequestsPerDay).toBe(0);
  });

  it("ignores a paid tier when reading the free plan's limits", async () => {
    listTiers.mockResolvedValue([
      { id: "tier_pro", requestsPerMinute: 600, requestsPerDay: 100_000, enabled: true },
      FREE_TIER,
    ]);
    const values = await resolveSiteVariableValues();

    expect(values.freeRequestsPerMinute).toBe(FREE_TIER.requestsPerMinute);
  });
});
