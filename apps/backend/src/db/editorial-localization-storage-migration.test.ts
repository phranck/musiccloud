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
  /**
   * The SQL assertion looks for the migration that performs the drop rather
   * than assuming it is the newest one, so an unrelated migration added later
   * does not fail this. The snapshot assertion always reads the newest
   * snapshot, because that is the state the schema is actually in.
   */
  it("drops the retired tables and admin locale, and keeps them out of the current snapshot", async () => {
    const migrationsRoot = resolve(process.cwd(), "src/db/migrations/postgres");
    const journal = JSON.parse(await readFile(resolve(migrationsRoot, "meta/_journal.json"), "utf8")) as DrizzleJournal;
    const latest = [...journal.entries].sort((left, right) => right.idx - left.idx)[0];
    expect(latest).toBeDefined();

    const statements = [
      'DROP TABLE "content_page_translations" CASCADE;',
      'DROP TABLE "page_segment_translations" CASCADE;',
      'DROP TABLE "nav_item_translations" CASCADE;',
      'ALTER TABLE "admin_users" DROP COLUMN "locale";',
    ];
    const migrations = await Promise.all(
      journal.entries.map((entry) => readFile(resolve(migrationsRoot, `${entry.tag}.sql`), "utf8")),
    );
    for (const statement of statements) {
      expect(
        migrations.some((sql) => sql.includes(statement)),
        `no migration contains ${statement}`,
      ).toBe(true);
    }

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
