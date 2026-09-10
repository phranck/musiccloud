/**
 * @file Renames the icons on the portal's pages to the ones the portal draws.
 *
 * The developer portal is set in Iconsax, and the shortcode now draws from that
 * set when it renders for the portal. Pages written before that name Phosphor
 * icons, which Iconsax has no word for, so they render as their own source.
 *
 * This translates them. The mapping is a judgement about which icon means the
 * same thing in the other hand, which is why every entry says what it marks: a
 * name that turns out to be the wrong choice is a dashboard edit afterwards,
 * not another deployment.
 *
 * Only pages published to the portal are touched. The site is still Phosphor,
 * and a page there naming `disc` means `disc`.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-portal-icon-names.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-portal-icon-names.ts --apply
 *
 * Idempotent: a second run finds nothing, because no Iconsax name is also a
 * Phosphor one in this list.
 */

import { ContentContext } from "@musiccloud/shared";
import * as pgModule from "pg";

/**
 * What each Phosphor name becomes, and what it marks on the page.
 *
 * `key` is absent because both sets publish it under that name, so a page
 * naming it is already right.
 */
const RENAMES: readonly { from: string; to: string; marks: string }[] = [
  { from: "user-circle-plus", to: "profile-add", marks: "creating an account" },
  { from: "user-circle", to: "profile-circle", marks: "an artist" },
  { from: "book-open", to: "book", marks: "reading, and a project on the docs page" },
  { from: "app-window", to: "devices", marks: "an application, in the places it runs" },
  { from: "link-simple", to: "link", marks: "resolving a link" },
  { from: "disc", to: "cd", marks: "a recording" },
];

/** Where a name is written: the icon shortcode, and a button's symbol. */
const ATTRIBUTES = ["name", "icon"] as const;

/** One page that needs renaming, with what it becomes. */
interface Rewrite {
  id: string;
  slug: string;
  before: string;
  after: string;
  renamed: string[];
}

/**
 * Renames every icon on one page.
 *
 * Only a whole attribute value is replaced, so a name that happens to appear
 * inside a sentence is left alone.
 *
 * @param content - The page as stored.
 * @returns What it becomes and which names changed.
 */
export function rewritePortalIconNames(content: string): { after: string; renamed: string[] } {
  let after = content;
  const renamed: string[] = [];

  for (const { from, to } of RENAMES) {
    for (const attribute of ATTRIBUTES) {
      const written = `${attribute}="${from}"`;
      if (!after.includes(written)) continue;
      after = after.split(written).join(`${attribute}="${to}"`);
      if (!renamed.includes(`${from} → ${to}`)) renamed.push(`${from} → ${to}`);
    }
  }

  return { after, renamed };
}

/**
 * Finds every portal page carrying a name from the other set.
 *
 * @param client - A connected client.
 * @returns One entry per page that changes.
 */
async function planRewrites(client: pgModule.Client): Promise<Rewrite[]> {
  const { rows } = await client.query<{ id: string; slug: string; content: string }>(
    `select c.id, c.slug, c.content
       from content_pages c
       join content_page_publications p on p.page_id = c.id
      where p.context = $1
      group by c.id, c.slug, c.content
      order by c.slug`,
    [ContentContext.DeveloperPortal],
  );

  return rows
    .map((row) => ({ row, ...rewritePortalIconNames(row.content) }))
    .filter((entry) => entry.renamed.length > 0)
    .map(({ row, after, renamed }) => ({ id: row.id, slug: row.slug, before: row.content, after, renamed }));
}

/**
 * Reports what is there, and renames it when asked.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[rewrite-portal-icons] DATABASE_URL is not set.");
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const rewrites = await planRewrites(client);
    for (const rewrite of rewrites) {
      console.log(`[rewrite-portal-icons] ${rewrite.slug}: ${rewrite.renamed.join(", ")}`);
    }

    if (rewrites.length === 0) {
      console.log("[rewrite-portal-icons] nothing to do.");
      return;
    }
    if (!apply) {
      console.log(`[rewrite-portal-icons] ${rewrites.length} page(s) would change. Pass --apply to write them.`);
      return;
    }

    // One transaction, so a run that fails part-way leaves no page half in each
    // set, which would render some of its symbols and print the rest.
    await client.query("begin");
    for (const rewrite of rewrites) {
      await client.query("update content_pages set content = $1, content_updated_at = now() where id = $2", [
        rewrite.after,
        rewrite.id,
      ]);
    }
    await client.query("commit");
    console.log(`[rewrite-portal-icons] ${rewrites.length} page(s) written.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("rewrite-portal-icon-names.ts")) {
  main().catch((error) => {
    console.error("[rewrite-portal-icons]", error);
    process.exit(1);
  });
}
