import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface DrizzleJournal {
  entries: Array<{ idx: number; tag: string }>;
}

interface DrizzleSnapshot {
  tables: Record<string, { columns: Record<string, unknown> }>;
}

describe("editorial localization storage migration", () => {
  it("drops the retired tables and admin locale from the latest Drizzle snapshot", async () => {
    const migrationsRoot = resolve(process.cwd(), "src/db/migrations/postgres");
    const journal = JSON.parse(await readFile(resolve(migrationsRoot, "meta/_journal.json"), "utf8")) as DrizzleJournal;
    const latest = [...journal.entries].sort((left, right) => right.idx - left.idx)[0];
    expect(latest).toBeDefined();

    const sql = await readFile(resolve(migrationsRoot, `${latest?.tag}.sql`), "utf8");
    expect(sql).toContain('DROP TABLE "content_page_translations" CASCADE;');
    expect(sql).toContain('DROP TABLE "page_segment_translations" CASCADE;');
    expect(sql).toContain('DROP TABLE "nav_item_translations" CASCADE;');
    expect(sql).toContain('ALTER TABLE "admin_users" DROP COLUMN "locale";');

    const snapshot = JSON.parse(
      await readFile(resolve(migrationsRoot, `meta/${String(latest?.idx).padStart(4, "0")}_snapshot.json`), "utf8"),
    ) as DrizzleSnapshot;
    expect(snapshot.tables).not.toHaveProperty("public.content_page_translations");
    expect(snapshot.tables).not.toHaveProperty("public.page_segment_translations");
    expect(snapshot.tables).not.toHaveProperty("public.nav_item_translations");
    const adminUsers = snapshot.tables["public.admin_users"];
    expect(adminUsers).toBeDefined();
    if (!adminUsers) throw new Error("Drizzle snapshot is missing public.admin_users");
    expect(adminUsers.columns).not.toHaveProperty("locale");
  });
});
