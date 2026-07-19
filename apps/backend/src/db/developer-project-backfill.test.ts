import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { backfillDeveloperProjects } from "./developer-project-backfill.js";

describe("developer project backfill", () => {
  it("runs the deterministic backfill transaction and verifies there are no ownership gaps", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("AS clients_without_project")) {
        return {
          rows: [
            {
              clients_without_project: 0,
              accounts_without_project: 0,
              projects_without_subscription: 0,
              duplicate_project_subscriptions: 0,
            },
          ],
        };
      }
      return { rows: [], rowCount: sql.includes("INSERT INTO developer_projects") ? 2 : 0 };
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const result = await backfillDeveloperProjects(pool);

    expect(query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("legacy-client-project:"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("legacy-account-project:"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("ON CONFLICT"))).toBe(true);
    expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(result).toMatchObject({
      clientsWithoutProject: 0,
      accountsWithoutProject: 0,
      projectsWithoutSubscription: 0,
      duplicateProjectSubscriptions: 0,
    });
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back when deterministic ownership cannot be completed", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("AS clients_without_project")) {
        return {
          rows: [
            {
              clients_without_project: 1,
              accounts_without_project: 0,
              projects_without_subscription: 1,
              duplicate_project_subscriptions: 0,
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await expect(backfillDeveloperProjects(pool)).rejects.toThrow("ownership gaps");

    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });
});
