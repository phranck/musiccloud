/**
 * @file Rewrites every stored fields list into the bracket notation.
 *
 * A fields list used to be written `:::fields … :::`, which was the one
 * shortcode with a notation of its own. It is now `[[fields { … }]]` like every
 * other container, and the renderer reads that form alone, so a page still
 * carrying the old one renders its source as text.
 *
 * This finds those pages and rewrites them. It reports what it would do and
 * changes nothing until `--apply` is passed, and every rewrite is checked
 * against the parser before it is written: the new text has to yield the same
 * rows and the same layout as the old one, or that page is left alone and named
 * in the report.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-fields-shortcode.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-fields-shortcode.ts --apply
 *
 * Idempotent: a second run finds nothing, because the pattern it looks for is
 * the notation it removes.
 */

import { FIELDS_SHORTCODE, parseShortcodes } from "@musiccloud/shared";
import * as pgModule from "pg";

/**
 * The old notation, opened on a line of its own and closed on another.
 *
 * The leading whitespace is captured rather than skipped, because a list inside
 * a card is indented with it and the bracket form has to land at the same level.
 */
const FENCE_BLOCK = /^([ \t]*):::fields[ \t]*([^\r\n]*)\r?\n([\s\S]*?)\r?\n[ \t]*:::[ \t]*$/gm;

/** An attribute as the old notation allowed it, with or without quotes. */
const ATTRIBUTE = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|(\S+))/g;

/** One page that needs rewriting, with what it becomes. */
interface Rewrite {
  id: string;
  slug: string;
  before: string;
  after: string;
}

/**
 * Turns the attributes of an old fields list into quoted ones.
 *
 * The old notation took a bare value, so `gap=2rem` was legal there. Quoting it
 * is what the examples show and what leaves no doubt where a value ends.
 *
 * @param raw - Everything written after `:::fields` on its line.
 * @returns The attributes as they go inside the brackets, with a leading space,
 *   or an empty string where the list carried none.
 */
function quoteAttributes(raw: string): string {
  const parts: string[] = [];
  for (const match of raw.matchAll(ATTRIBUTE)) {
    parts.push(`${match[1]}="${match[2] ?? match[3]}"`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Whether a body can be carried between braces at all.
 *
 * The bracket form counts braces to find where a body ends, so a row holding an
 * unbalanced one would close the container early. No stored page does, and this
 * is what proves it rather than assuming it.
 *
 * @param body - The rows between the markers.
 * @returns Whether the body is safe to move.
 */
function bodyIsBalanced(body: string): boolean {
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "\\") {
      index += 1;
      continue;
    }
    if (body[index] === "{") depth += 1;
    else if (body[index] === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * The rows of a fields list as the renderer reads them.
 *
 * Each row is trimmed, which is what the renderer does before splitting a label
 * from its value. It matters here because the two notations treat a body's own
 * indentation differently: the old one keeps it and the new one takes it off.
 * Neither reaches the page, so neither counts as a difference.
 *
 * @param body - The body as the parser handed it back.
 * @returns One entry per row, blank lines dropped.
 */
function rowsOf(body: string | undefined): string[] {
  return (body ?? "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row !== "");
}

/**
 * Checks that a rewritten block says the same thing as the block it replaces.
 *
 * The old notation is read here rather than through the parser, because nothing
 * in the codebase understands it any more. That is the point of this script,
 * and it is why the knowledge of the retired form lives in the one-off that
 * retires it.
 *
 * The block is read on its own rather than as part of the page, because a
 * fields list usually sits inside a card and a scan of the page would see the
 * card and stop there. The two are compared on what a reader would see: the
 * same rows in the same order, and the same value for every attribute the old
 * one carried.
 *
 * @param attributes - Everything written after `:::fields` on its line.
 * @param body - The rows between the markers.
 * @param newBlock - What the two become, at column zero.
 * @returns Whether the rewrite says the same thing.
 */
export function rewriteIsFaithful(attributes: string, body: string, newBlock: string): boolean {
  const [after] = parseShortcodes(newBlock, [FIELDS_SHORTCODE]);
  if (!after || after.token !== FIELDS_SHORTCODE.token) return false;

  if (JSON.stringify(rowsOf(body)) !== JSON.stringify(rowsOf(after.body))) return false;

  for (const match of attributes.matchAll(ATTRIBUTE)) {
    if (String(after.params[match[1]] ?? "") !== (match[2] ?? match[3])) return false;
  }
  return true;
}

/**
 * Rewrites every fields list in one page's content.
 *
 * @param content - The page as stored.
 * @returns The page with every fields list in the bracket notation, or `null`
 *   when it carries none that can be moved. A block whose braces do not balance
 *   or whose two readings differ stops the whole page, so a page is never left
 *   half on each notation.
 */
export function rewriteFieldsShortcodes(content: string): string | null {
  FENCE_BLOCK.lastIndex = 0;
  if (!FENCE_BLOCK.test(content)) return null;
  FENCE_BLOCK.lastIndex = 0;

  let refused = false;
  const rewritten = content.replace(FENCE_BLOCK, (whole, indent: string, attributes: string, body: string) => {
    const replacement = `${indent}[[fields${quoteAttributes(attributes)} {\n${body}\n${indent}}]]`;

    // Compared at column zero, because the indentation is what puts the block
    // inside a card and neither reading is about that.
    const newBlock = `[[fields${quoteAttributes(attributes)} {\n${body}\n}]]`;

    if (!bodyIsBalanced(body) || !rewriteIsFaithful(attributes, body, newBlock)) {
      refused = true;
      return whole;
    }
    return replacement;
  });

  return refused ? null : rewritten;
}

/**
 * Finds every page that still carries the old notation.
 *
 * @param client - A connected client.
 * @returns One entry per page that can be rewritten, and the slugs of any that
 *   cannot.
 */
async function planRewrites(client: pgModule.Client): Promise<{ rewrites: Rewrite[]; refused: string[] }> {
  const { rows } = await client.query<{ id: string; slug: string; content: string }>(
    "select id, slug, content from content_pages where content like '%:::fields%' order by slug",
  );

  const rewrites: Rewrite[] = [];
  const refused: string[] = [];

  for (const row of rows) {
    const after = rewriteFieldsShortcodes(row.content);
    if (after === null || after === row.content) {
      refused.push(row.slug);
      continue;
    }
    rewrites.push({ id: row.id, slug: row.slug, before: row.content, after });
  }

  return { rewrites, refused };
}

/**
 * Reports what is there, and rewrites it when asked.
 *
 * @returns Nothing. Exits non-zero when a page could not be rewritten, so a run
 *   that left something behind cannot be mistaken for a clean one.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[rewrite-fields] DATABASE_URL is not set.");
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rewrites, refused } = await planRewrites(client);

    for (const rewrite of rewrites) {
      const count = (rewrite.before.match(/:::fields/g) ?? []).length;
      console.log(`[rewrite-fields] ${rewrite.slug}: ${count} list${count === 1 ? "" : "s"}`);
    }
    for (const slug of refused) {
      console.error(`[rewrite-fields] ${slug}: left alone, the two readings do not agree`);
    }

    if (rewrites.length === 0) {
      console.log("[rewrite-fields] nothing to do.");
    } else if (!apply) {
      console.log(`[rewrite-fields] ${rewrites.length} page(s) would change. Pass --apply to write them.`);
    } else {
      // One transaction, so a run that fails part-way leaves every page as it
      // was rather than half of them on each notation.
      await client.query("begin");
      for (const rewrite of rewrites) {
        await client.query("update content_pages set content = $1, content_updated_at = now() where id = $2", [
          rewrite.after,
          rewrite.id,
        ]);
      }
      await client.query("commit");
      console.log(`[rewrite-fields] ${rewrites.length} page(s) written.`);
    }

    if (refused.length > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

// Only when run directly, so the pure functions above stay importable by the
// tests without opening a connection.
if (process.argv[1]?.endsWith("rewrite-fields-shortcode.ts")) {
  main().catch((error) => {
    console.error("[rewrite-fields]", error);
    process.exit(1);
  });
}
