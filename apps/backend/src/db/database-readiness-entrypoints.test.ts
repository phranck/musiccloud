import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

describe("database readiness entry points", () => {
  it("asserts the full database report after Drizzle migrations", async () => {
    const code = await source("src/db/run-migrations.ts");

    expect(code).toContain("inspectMusiccloudDatabase");
    expect(code).toContain("assertDatabaseReady");
    expect(code.indexOf("await migrate(")).toBeLessThan(code.indexOf("await inspectMusiccloudDatabase"));
  });

  it("uses privilege-aware readiness for the health endpoint", async () => {
    const code = await source("src/server.ts");

    expect(code).toContain("getRuntimeDatabaseReadinessReport");
    expect(code).not.toContain("findMissingTables");
  });
});
