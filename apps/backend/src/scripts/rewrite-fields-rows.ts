/**
 * @file Moves a fields list's rows into the entries it now names.
 *
 * A fields list used to read its entries off lines of `Label: value`. A label
 * is content rather than a setting, so an entry is a child now, with its label
 * and its value both Markdown, and the renderer reads nothing else.
 *
 * This rewrites the pages that still carry the old form. It changes nothing
 * until `--apply` is passed, and it refuses a page it cannot read cleanly
 * rather than writing half of one.
 *
 * Run against the local database, then against the deployed one:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-fields-rows.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/rewrite-fields-rows.ts --apply
 *
 * Idempotent: a rewritten page carries no `Label: value` row, so a second run
 * finds nothing.
 */

import * as pgModule from "pg";

/**
 * A fields list as it was written, with whatever stood on its opening line.
 *
 * Built per call rather than shared. A global regular expression carries its
 * own cursor between calls, and these run over every page in turn, so a shared
 * one skips a page for no reason anybody could see afterwards. It did.
 */
function fieldsBlockPattern(): RegExp {
  return /^([ \t]*)\[\[fields([^\r\n{]*)\{\r?\n([\s\S]*?)\r?\n[ \t]*\}\]\]/gm;
}

/** One `name="value"` on an opening line. */
function attributePattern(): RegExp {
  return /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|(\S+))/g;
}

/** A row of the old form: everything before the first colon is the label. */
const ROW = /^\s*([^:]+):\s*(.*)$/;

/** One page that changes, and what it becomes. */
interface Rewrite {
  id: string;
  slug: string;
  after: string;
}

/**
 * The attributes written on an opening line, in the order they stood.
 *
 * @param raw - Everything between the token and the opening brace.
 * @returns Each name with its value.
 */
function readAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of raw.matchAll(attributePattern())) {
    attributes.set(match[1], match[2] ?? match[3]);
  }
  return attributes;
}

/**
 * Writes attributes back onto an opening line.
 *
 * @param attributes - What to write.
 * @returns The text that follows the token, with a leading space where there is
 *   anything to write.
 */
function writeAttributes(attributes: Map<string, string>): string {
  const parts = [...attributes].map(([name, value]) => `${name}="${value}"`);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

/**
 * Turns the rows of one fields list into fields.
 *
 * A line without a colon was never a row and was dropped by the old renderer,
 * so it is dropped here too rather than being guessed at.
 *
 * @param body - What stood between the list's braces.
 * @param indent - The list's own indentation, which its children take one step
 *   further in.
 * @returns The children, or `null` where nothing in there was a row.
 */
function rowsToFields(body: string, indent: string): string | null {
  const fields: string[] = [];

  for (const line of body.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const row = line.match(ROW);
    if (!row) return null;

    const label = row[1].trim();
    const value = row[2].trim();
    if (!label) return null;

    fields.push(`${indent}  [[field label="${label.replace(/"/g, "&quot;")}" {\n${indent}    ${value}\n${indent}  }]]`);
  }

  return fields.length > 0 ? fields.join("\n") : null;
}

/**
 * Rewrites every fields list on one page.
 *
 * @param content - The page as stored.
 * @returns What it becomes, and whether anything changed.
 */
function rewriteFields(content: string): { after: string; changed: boolean } | null {
  if (!fieldsBlockPattern().test(content)) return { after: content, changed: false };

  let refused = false;
  const after = content.replace(fieldsBlockPattern(), (whole, indent: string, attributes: string, body: string) => {
    // A list already written with fields is left exactly as it stands.
    if (body.includes("[[field ")) return whole;

    const fields = rowsToFields(body, indent);
    if (!fields) {
      refused = true;
      return whole;
    }

    // `labelWidth` is what the width used to be called.
    const written = readAttributes(attributes);
    const labelWidth = written.get("labelWidth");
    if (labelWidth !== undefined) {
      written.delete("labelWidth");
      written.set("width", labelWidth);
    }

    // No braces of its own: a list holds its entries and nothing else.
    return `${indent}[[fields${writeAttributes(written)}\n${fields}\n${indent}]]`;
  });

  return refused ? null : { after, changed: after !== content };
}

/**
 * Finds every page still carrying either old form.
 *
 * @param client - A connected client.
 * @returns The pages that change, and the slugs of any that could not be read.
 */
async function planRewrites(client: pgModule.Client): Promise<{ rewrites: Rewrite[]; refused: string[] }> {
  const { rows } = await client.query<{ id: string; slug: string; content: string }>(
    "select id, slug, content from content_pages order by slug",
  );

  const rewrites: Rewrite[] = [];
  const refused: string[] = [];

  for (const row of rows) {
    const fields = rewriteFields(row.content);
    if (!fields) {
      refused.push(row.slug);
      continue;
    }

    if (fields.changed) rewrites.push({ id: row.id, slug: row.slug, after: fields.after });
  }

  return { rewrites, refused };
}

/**
 * Reports what is there, and rewrites it when asked.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[rewrite-fields-rows] DATABASE_URL is not set.");
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rewrites, refused } = await planRewrites(client);
    for (const rewrite of rewrites) {
      console.log(`[rewrite-fields-rows] ${rewrite.slug}`);
    }
    for (const slug of refused) {
      console.error(`[rewrite-fields-rows] ${slug}: left alone, a line in a fields list is not a row`);
    }

    if (rewrites.length === 0) {
      console.log("[rewrite-fields-rows] nothing to do.");
    } else if (!apply) {
      console.log(`[rewrite-fields-rows] ${rewrites.length} page(s) would change. Pass --apply to write them.`);
    } else {
      // One transaction, so a run that fails part-way leaves no page half in
      // each form.
      await client.query("begin");
      for (const rewrite of rewrites) {
        await client.query("update content_pages set content = $1, content_updated_at = now() where id = $2", [
          rewrite.after,
          rewrite.id,
        ]);
      }
      await client.query("commit");
      console.log(`[rewrite-fields-rows] ${rewrites.length} page(s) written.`);
    }

    if (refused.length > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.endsWith("rewrite-fields-rows.ts")) {
  main().catch((error) => {
    console.error("[rewrite-fields-rows]", error);
    process.exit(1);
  });
}

export { rewriteFields };
