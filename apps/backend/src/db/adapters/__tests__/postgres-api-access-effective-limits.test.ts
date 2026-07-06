/**
 * @file Unit tests for the effective rate-limit resolution (MC-100): every
 * client read maps `per-key override ?? account tier limit ?? conservative
 * fallback` in `rowToApiClient`. Exercised through {@link findApiClientById}
 * with a stubbed pg Pool, so the JOIN row shape is the single input.
 */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_REQUESTS_PER_DAY, FALLBACK_REQUESTS_PER_MINUTE } from "../../tiers-repository.js";
import { findApiClientById } from "../postgres-api-access.js";

/** Builds a complete client JOIN row (as the CLIENT_JOIN_SELECT returns it) that tests override field-by-field. */
function makeJoinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    request_id: null,
    developer_account_id: "dev-1",
    app_name: "App",
    contact_email: "dev@example.com",
    description: "Desc",
    status: "active",
    requests_per_minute: null,
    requests_per_day: null,
    tier_id: "tier-1",
    tier_name: "Free",
    tier_requests_per_minute: 120,
    tier_requests_per_day: 20000,
    created_at: new Date(1_700_000_000_000),
    updated_at: new Date(1_700_000_000_000),
    created_by_admin_id: null,
    ...overrides,
  };
}

/** Stubs a pg Pool whose single query resolves to the given row. */
function poolWith(row: Record<string, unknown>): Pool {
  return { query: vi.fn().mockResolvedValue({ rows: [row] }) } as unknown as Pool;
}

describe("effective rate-limit resolution (override ?? tier ?? fallback)", () => {
  it("prefers the per-key override over the tier limit", async () => {
    const client = await findApiClientById(
      poolWith(makeJoinRow({ requests_per_minute: 5, requests_per_day: 99 })),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(5);
    expect(client?.effectiveRequestsPerDay).toBe(99);
  });

  it("inherits the tier limit when the override is null", async () => {
    const client = await findApiClientById(poolWith(makeJoinRow()), "client-1");
    expect(client?.effectiveRequestsPerMinute).toBe(120);
    expect(client?.effectiveRequestsPerDay).toBe(20000);
  });

  it("mixes per-field: minute override set, day inherited", async () => {
    const client = await findApiClientById(poolWith(makeJoinRow({ requests_per_minute: 7 })), "client-1");
    expect(client?.effectiveRequestsPerMinute).toBe(7);
    expect(client?.effectiveRequestsPerDay).toBe(20000);
  });

  it("falls back to the conservative defaults when the account has no tier", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({ tier_id: null, tier_name: null, tier_requests_per_minute: null, tier_requests_per_day: null }),
      ),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(FALLBACK_REQUESTS_PER_MINUTE);
    expect(client?.effectiveRequestsPerDay).toBe(FALLBACK_REQUESTS_PER_DAY);
  });
});
