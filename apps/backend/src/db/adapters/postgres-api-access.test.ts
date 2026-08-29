/**
 * @file Adapter tests for the two counts that back the self-service creation
 * ceilings. What they have to get right is which rows they leave out: a
 * soft-deleted project and a revoked registration have both given their slot
 * back, so neither may hold a developer at the ceiling.
 */
import type { Pool, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import { countActiveApiClientsByProject, countActiveDeveloperProjectsByAccount } from "./postgres-api-access.js";

function result(rows: unknown[] = []): QueryResult {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows } as QueryResult;
}

describe("API-access creation ceilings", () => {
  it("counts the projects an account holds and leaves the deleted ones out", async () => {
    const query = vi.fn().mockResolvedValue(result([{ cnt: 3 }]));
    const pool = { query } as unknown as Pool;

    await expect(countActiveDeveloperProjectsByAccount(pool, "dev-1")).resolves.toBe(3);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM developer_projects");
    expect(sql).toContain("status <> 'deleted'");
    expect(values).toEqual(["dev-1"]);
  });

  it("counts the registrations a project holds and leaves the revoked ones out", async () => {
    const query = vi.fn().mockResolvedValue(result([{ cnt: 2 }]));
    const pool = { query } as unknown as Pool;

    await expect(countActiveApiClientsByProject(pool, "project-1")).resolves.toBe(2);

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FROM api_clients");
    expect(sql).toContain("status <> 'revoked'");
    expect(values).toEqual(["project-1"]);
  });
});
