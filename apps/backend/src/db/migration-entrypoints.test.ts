import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("migration entry points", () => {
  it("checks the connected identity before the backend invokes Drizzle", async () => {
    const code = await source("src/db/run-migrations.ts");

    expect(code).toContain("assertSafeMigrationConnection");
    expect(code.indexOf("assertSafeMigrationConnection")).toBeLessThan(code.indexOf("await migrate("));
  });

  it("delegates the root migration command to the guarded backend runner", async () => {
    const code = await source("../../scripts/migrate.mjs");

    expect(code).toContain("src/db/migrate-cli.ts");
    expect(code).not.toContain("drizzleMigrate");
  });

  it("never reads the production admin connection variable", async () => {
    const entrypoints = await Promise.all([
      source("src/db/run-migrations.ts"),
      source("src/db/migrate-cli.ts").catch(() => ""),
      source("../../scripts/migrate.mjs"),
    ]);

    for (const code of entrypoints) {
      expect(code).not.toContain("ZEROPS_DB_ADMIN_URL");
      expect(code).not.toContain("ZEROPS_DB_URL");
    }
  });
});
