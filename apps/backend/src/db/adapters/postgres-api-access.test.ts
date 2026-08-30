/**
 * @file Adapter tests for what the API-access tables are asked to hold: the
 * two counts that back the self-service creation ceilings, and the token
 * insert, which must write a hash and never the token it hashed.
 *
 * The counts have to get right which rows they leave out. A soft-deleted
 * project and a revoked registration have both given their slot back, so
 * neither may hold a developer at the ceiling.
 */
import type { Pool, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  countActiveApiClientsByProject,
  countDeveloperProjectsAgainstCeiling,
  createApiClientToken,
} from "./postgres-api-access.js";

function result(rows: unknown[] = []): QueryResult {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows } as QueryResult;
}

describe("API-access creation ceilings", () => {
  it("counts the projects an account holds and leaves the deleted ones out", async () => {
    const query = vi.fn().mockResolvedValue(result([{ cnt: 3 }]));
    const pool = { query } as unknown as Pool;

    await expect(countDeveloperProjectsAgainstCeiling(pool, "dev-1")).resolves.toBe(3);

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

describe("issuing a token", () => {
  it("writes the hash and never the token that was hashed", async () => {
    const issued = "mc_live_mcpat_abc_thesecretitself";
    const query = vi.fn().mockResolvedValue(
      result([
        {
          id: "token-1",
          client_id: "client-1",
          token_prefix: "mcpat_abc",
          token_hash: "deadbeef",
          status: "active",
          created_at: new Date(1_700_000_000_000),
          last_used_at: null,
          revoked_at: null,
          rotated_from_token_id: null,
        },
      ]),
    );

    const token = await createApiClientToken({ query } as unknown as Pool, {
      clientId: "client-1",
      tokenPrefix: "mcpat_abc",
      tokenHash: "deadbeef",
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("token_raw");
    expect(values).not.toContain(issued);
    expect(values).toContain("deadbeef");
    expect(token).not.toHaveProperty("rawToken");
    expect(token.tokenPrefix).toBe("mcpat_abc");
  });
});
