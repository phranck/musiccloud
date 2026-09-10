/**
 * @file Creates the developer portal's home page, if it is not there yet.
 *
 * `/` used to be markup. It is a content page now, so a database that has never
 * had one serves nothing at the portal's front door, and the route answers 503.
 * This puts the page there, with the copy the route used to carry.
 *
 * It creates and never overwrites: once the page exists, what it says is
 * whatever was last written in the dashboard, and a seed that reasserted itself
 * would undo somebody's edit on the next deployment.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-portal-home.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/seed-portal-home.ts --apply
 */

import { ContentContext } from "@musiccloud/shared";
import * as pgModule from "pg";
import {
  PORTAL_HOME_CONTENT,
  PORTAL_HOME_PATH,
  PORTAL_HOME_SLUG,
  PORTAL_HOME_TITLE,
} from "../services/content/portal-home-page.js";

/** What the portal's own pages are published under. */
const TEMPLATE_KEY = "developer-default";

/**
 * Whether the page is already there.
 *
 * @param client - A connected client.
 * @returns Whether anything is published at the portal's front door.
 */
async function homeExists(client: pgModule.Client): Promise<boolean> {
  const { rows } = await client.query<{ count: string }>(
    "select count(*)::text as count from content_page_publications where context = $1 and path = $2",
    [ContentContext.DeveloperPortal, PORTAL_HOME_PATH],
  );
  return Number(rows[0]?.count ?? "0") > 0;
}

/**
 * Creates the page and publishes it.
 *
 * One transaction, so a run that fails part-way leaves no page without a
 * publication, which would be a page nobody can reach and nobody can see.
 *
 * @param client - A connected client.
 */
async function createHome(client: pgModule.Client): Promise<void> {
  await client.query("begin");
  try {
    const { rows } = await client.query<{ id: string }>(
      `insert into content_pages
         (id, slug, title, content, status, context_mask, page_type, display_mode, overlay_width,
          title_alignment, content_card_style, show_title, position, created_at, content_updated_at)
       values (gen_random_uuid()::text, $1, $2, $3, 'published', $4, 'default', 'fullscreen', 'regular',
               'left', 'recessed', true, 0, now(), now())
       returning id`,
      [PORTAL_HOME_SLUG, PORTAL_HOME_TITLE, PORTAL_HOME_CONTENT, ContentContext.DeveloperPortal],
    );

    const id = rows[0]?.id;
    if (!id) throw new Error("The page was not written back, so nothing can be published at it.");

    await client.query(
      "insert into content_page_publications (page_id, context, path, status, template_key) values ($1, $2, $3, 'published', $4)",
      [id, ContentContext.DeveloperPortal, PORTAL_HOME_PATH, TEMPLATE_KEY],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

/**
 * Reports what is there, and creates the page when asked.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[seed-portal-home] DATABASE_URL is not set.");
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (await homeExists(client)) {
      console.log("[seed-portal-home] a page is already published at the portal's front door; nothing to do.");
      return;
    }
    if (!apply) {
      console.log("[seed-portal-home] nothing is published there. Pass --apply to create the page.");
      return;
    }
    await createHome(client);
    console.log("[seed-portal-home] created and published.");
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("seed-portal-home.ts")) {
  main().catch((error) => {
    console.error("[seed-portal-home]", error);
    process.exit(1);
  });
}
