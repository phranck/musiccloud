import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSafeIntegrationDatabase } from "../__tests__/integration-database.js";
import { resolveMigrationsFolder } from "./run-migrations.js";

const MIGRATION_TAG = "0100_remove_keyless_docs_section";

/** The section as the docs page carries it: a heading and the card that follows. */
const KEYLESS_SECTION = [
  "## Trying it without a key",
  "",
  "[[card {",
  "  `GET /api/v1/resolve` answers without any credential: {keylessRequestsPerMinute} requests a minute and {keylessRequestsPerDay} a day.",
  "}]]",
].join("\n");

const BEFORE = "# Docs\n\n[[card {\n  Create a project first.\n}]]";
const AFTER = "## Errors\n\n[[card {\n  Every error carries an errorId.\n}]]\n";

interface PageRow {
  slug: string;
  content: string;
}

/**
 * The migration cuts one section out of editor-owned content, so these cases
 * hold it to exactly that section: the text before and after it stays as it
 * was, a page without the heading is not touched, and a second run changes
 * nothing.
 *
 * It runs inside a rolled-back transaction against a temporary table that
 * shadows `content_pages` for this session, so no stored page is touched.
 */
describe.skipIf(!isSafeIntegrationDatabase(process.env.DATABASE_URL))(
  "keyless docs section migration (integration)",
  () => {
    let client: pg.Client;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
    });

    afterAll(async () => {
      await client.end();
    });

    it("removes the section and its card from the docs page and nothing else", async () => {
      const migration = await readFile(path.join(resolveMigrationsFolder(), `${MIGRATION_TAG}.sql`), "utf8");

      await client.query("BEGIN");
      try {
        await client.query("CREATE TEMP TABLE content_pages (LIKE public.content_pages INCLUDING ALL) ON COMMIT DROP");
        const shadowing = await client.query<{ shadowed: boolean }>(
          "SELECT 'content_pages'::regclass = 'pg_temp.content_pages'::regclass AS shadowed",
        );
        // The migration may only run once its unqualified table name resolves to
        // the temporary copy.
        expect(shadowing.rows[0]?.shadowed).toBe(true);

        await client.query(
          `INSERT INTO content_pages (slug, title, content) VALUES
             ('docs', 'Docs', $1),
             ('home', 'Home', $2)`,
          [`${BEFORE}\n\n${KEYLESS_SECTION}\n\n${AFTER}`, `${BEFORE}\n\n${KEYLESS_SECTION}`],
        );

        await client.query(migration);
        const second = await client.query(migration);

        const pages = await client.query<PageRow>("SELECT slug, content FROM content_pages ORDER BY slug");
        const contentOf = (slug: string) => pages.rows.find((row) => row.slug === slug)?.content;

        expect(contentOf("docs")).toBe(`${BEFORE}\n\n${AFTER}`);
        expect(contentOf("home")).toBe(`${BEFORE}\n\n${KEYLESS_SECTION}`);
        expect(second.rowCount).toBe(0);
      } finally {
        await client.query("ROLLBACK");
      }
    });
  },
);
