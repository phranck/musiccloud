/**
 * @file Unit tests for the effective rate-limit resolution (MC-100): every
 * registration read maps `min(registration cap, project override ?? project
 * subscription tier ?? conservative fallback)` in `rowToApiClient`. Exercised through {@link findApiClientById}
 * with a stubbed pg Pool, so the JOIN row shape is the single input.
 */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_REQUESTS_PER_DAY, FALLBACK_REQUESTS_PER_MINUTE } from "../../tiers-repository.js";
import {
  findActiveApiClientByTokenHash,
  findApiClientById,
  setDeveloperProjectSubscription,
} from "../postgres-api-access.js";

/** Builds a complete client JOIN row (as the CLIENT_JOIN_SELECT returns it) that tests override field-by-field. */
function makeJoinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    request_id: null,
    developer_account_id: "dev-1",
    project_id: "project-1",
    public_client_id: "mc_client_1",
    registration_type: "development",
    capabilities: ["legacy_api_key"],
    app_name: "App",
    contact_email: "dev@example.com",
    description: "Desc",
    status: "active",
    requests_per_minute: null,
    requests_per_day: null,
    project_display_name: "App project",
    project_status: "active",
    project_requests_per_minute: null,
    project_requests_per_day: null,
    project_developer_account_id: "dev-1",
    project_created_at: new Date(1_690_000_000_000),
    project_updated_at: new Date(1_695_000_000_000),
    project_suspended_at: null,
    project_deleted_at: null,
    project_created_by_admin_id: "admin-project",
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

describe("project-owned effective rate-limit resolution", () => {
  it("lets a registration cap narrow the project limit", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({
          requests_per_minute: 5,
          requests_per_day: 99,
          project_requests_per_minute: 10,
          project_requests_per_day: 200,
        }),
      ),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(5);
    expect(client?.effectiveRequestsPerDay).toBe(99);
  });

  it("does not let a registration cap widen the project override", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({
          requests_per_minute: 500,
          requests_per_day: 50000,
          project_requests_per_minute: 10,
          project_requests_per_day: 200,
        }),
      ),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(10);
    expect(client?.effectiveRequestsPerDay).toBe(200);
  });

  it("inherits the project subscription tier when project overrides and registration caps are null", async () => {
    const client = await findApiClientById(poolWith(makeJoinRow()), "client-1");
    expect(client?.effectiveRequestsPerMinute).toBe(120);
    expect(client?.effectiveRequestsPerDay).toBe(20000);
  });

  it("lets the project override widen a tier while the registration inherits it", async () => {
    const client = await findApiClientById(
      poolWith(makeJoinRow({ project_requests_per_minute: 240, project_requests_per_day: 40000 })),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(240);
    expect(client?.effectiveRequestsPerDay).toBe(40000);
  });

  it("resolves each quota field independently", async () => {
    const client = await findApiClientById(
      poolWith(makeJoinRow({ requests_per_minute: 7, project_requests_per_day: 30000 })),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(7);
    expect(client?.effectiveRequestsPerDay).toBe(30000);
  });

  it("surfaces the registration and project identity", async () => {
    const client = await findApiClientById(poolWith(makeJoinRow()), "client-1");
    expect(client).toMatchObject({
      id: "client-1",
      projectId: "project-1",
      publicClientId: "mc_client_1",
      registrationType: "development",
      capabilities: ["legacy_api_key"],
      projectStatus: "active",
    });
  });

  it("falls back to the conservative defaults when the project has no tier", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({
          project_requests_per_minute: null,
          project_requests_per_day: null,
          tier_id: null,
          tier_name: null,
          tier_requests_per_minute: null,
          tier_requests_per_day: null,
        }),
      ),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBe(FALLBACK_REQUESTS_PER_MINUTE);
    expect(client?.effectiveRequestsPerDay).toBe(FALLBACK_REQUESTS_PER_DAY);
  });

  it("returns the actual project lifecycle metadata with an authenticated registration", async () => {
    const projectCreatedAt = new Date(1_690_000_000_000);
    const projectUpdatedAt = new Date(1_695_000_000_000);
    const projectSuspendedAt = new Date(1_696_000_000_000);
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "token-1",
            client_id: "client-1",
            token_prefix: "prefix",
            token_hash: "hash",
            token_raw: null,
            status: "active",
            created_at: new Date(1_700_000_000_000),
            last_used_at: null,
            revoked_at: null,
            rotated_from_token_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          makeJoinRow({
            project_created_at: projectCreatedAt,
            project_updated_at: projectUpdatedAt,
            project_suspended_at: projectSuspendedAt,
            project_created_by_admin_id: "admin-project",
          }),
        ],
      });

    const resolved = await findActiveApiClientByTokenHash({ query } as unknown as Pool, "hash");

    expect(resolved?.project).toMatchObject({
      id: "project-1",
      developerAccountId: "dev-1",
      createdAt: projectCreatedAt.getTime(),
      updatedAt: projectUpdatedAt.getTime(),
      suspendedAt: projectSuspendedAt.getTime(),
      deletedAt: null,
      createdByAdminId: "admin-project",
    });
  });
});

describe("project subscription updates", () => {
  it("preserves omitted billing fields while changing the project tier", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "subscription-1",
          project_id: "project-1",
          tier_id: "tier-pro",
          creem_subscription_id: "sub_existing",
          creem_customer_id: "cus_existing",
          status: "active",
          interval: "month",
          current_period_end: new Date(1_800_000_000_000),
          cancel_at_period_end: true,
          created_at: new Date(1_700_000_000_000),
          updated_at: new Date(1_700_000_000_000),
        },
      ],
    });

    await setDeveloperProjectSubscription({ query } as unknown as Pool, {
      projectId: "project-1",
      tierId: "tier-pro",
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("CASE WHEN $11::boolean");
    expect(values.slice(10)).toEqual([false, false, false, false, false, false]);
  });
});
