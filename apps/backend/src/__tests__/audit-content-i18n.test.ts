import { describe, expect, it, vi } from "vitest";

import { runReadOnlyAudit } from "../../../../scripts/audit-content-i18n.mjs";

function createClient(failingTable?: string) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (failingTable && sql.includes(`FROM ${failingTable}`)) {
        throw new Error("inventory failed");
      }
      if (sql.startsWith("SELECT")) return { rows: [{ count: 0, locales: [] }] };
      return { rows: [] };
    }),
  };
  return { client, queries };
}

describe("editorial translation storage audit", () => {
  it("runs every inventory query inside a database-enforced read-only transaction", async () => {
    const { client, queries } = createClient();

    const result = await runReadOnlyAudit(client);

    expect(result).toMatchObject({ mode: "read-only", status: "dormant-legacy-storage" });
    expect(queries[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(queries.at(-1)).toBe("COMMIT");
    expect(queries.slice(1, -1)).toHaveLength(3);
    expect(queries.slice(1, -1).every((query) => query.startsWith("SELECT"))).toBe(true);
    expect(queries.join("\n")).not.toMatch(/\b(?:ALTER|CREATE|DELETE|DROP|INSERT|TRUNCATE|UPDATE)\b/);
  });

  it("rolls back the read-only transaction when inventory fails", async () => {
    const { client, queries } = createClient("page_segment_translations");

    await expect(runReadOnlyAudit(client)).rejects.toThrow("inventory failed");

    expect(queries[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(queries).not.toContain("COMMIT");
    expect(queries.at(-1)).toBe("ROLLBACK");
  });
});
