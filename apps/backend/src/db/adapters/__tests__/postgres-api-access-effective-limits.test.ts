/**
 * @file Unit tests for the effective rate-limit resolution (MC-100): every
 * registration read maps `min(registration cap, project override ?? granting
 * subscription tier)` in `rowToApiClient`, and resolves to no limit at all when
 * no subscription grants a tier. Exercised through {@link findApiClientById}
 * with a stubbed pg Pool, so the JOIN row shape is the single input. Which
 * subscription states reach that row is decided by the JOIN, so those tests
 * read the SQL instead.
 */
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  findActiveApiClientByTokenHash,
  findApiClientById,
  setDeveloperProjectSubscription,
} from "../postgres-api-access.js";

/**
 * The states `chk_developer_project_subscriptions_status` admits that must not
 * grant a tier. A subscription in any of them is a plan that has stopped
 * running, and the project it belongs to has no quota until it starts again.
 */
const NON_GRANTING_SUBSCRIPTION_STATES = ["paused", "past_due", "expired", "canceled"] as const;

/** The contents of the JOIN's `ps.status IN (…)` list, for asserting what it admits. */
function admittedSubscriptionStates(sql: string): string {
  const admitted = sql.match(/ps\.status IN \(([^)]*)\)/);
  if (!admitted) throw new Error("The subscription JOIN carries no status predicate.");
  return admitted[1] as string;
}

/** Runs one registration read against a stubbed pool and returns the SQL it issued. */
async function sqlForRegistrationRead(): Promise<string> {
  const query = vi.fn().mockResolvedValue({ rows: [makeJoinRow()] });
  await findApiClientById({ query } as unknown as Pool, "client-1");
  return (query.mock.calls[0] as [string])[0];
}

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

  it("resolves to no limit at all when no granting subscription supplies a tier", async () => {
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
    expect(client?.effectiveRequestsPerMinute).toBeNull();
    expect(client?.effectiveRequestsPerDay).toBeNull();
  });

  it("does not let a project override stand in for a plan", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({
          project_requests_per_minute: 500,
          project_requests_per_day: 50000,
          tier_id: null,
          tier_name: null,
          tier_requests_per_minute: null,
          tier_requests_per_day: null,
        }),
      ),
      "client-1",
    );
    expect(client?.effectiveRequestsPerMinute).toBeNull();
    expect(client?.effectiveRequestsPerDay).toBeNull();
  });

  it("does not let a registration cap stand in for a plan either", async () => {
    const client = await findApiClientById(
      poolWith(
        makeJoinRow({
          requests_per_minute: 5,
          requests_per_day: 99,
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
    expect(client?.effectiveRequestsPerMinute).toBeNull();
    expect(client?.effectiveRequestsPerDay).toBeNull();
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

describe("which subscription grants the tier", () => {
  it.each(NON_GRANTING_SUBSCRIPTION_STATES)("does not read a tier from a %s subscription", async (state) => {
    expect(admittedSubscriptionStates(await sqlForRegistrationRead())).not.toContain(state);
  });

  it("reads a tier from a running subscription", async () => {
    const admitted = admittedSubscriptionStates(await sqlForRegistrationRead());
    expect(admitted).toContain("active");
    expect(admitted).toContain("trialing");
    expect(admitted).toContain("scheduled_cancel");
  });

  it("takes the tier from the project's own subscription and never from the account", async () => {
    const sql = await sqlForRegistrationRead();
    expect(sql).not.toContain("da.tier_id");
    expect(sql).not.toContain("developer_accounts da");
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
