/**
 * Audits and backfills default-locale content i18n rows.
 *
 * Dry-run is the default:
 *   node scripts/audit-content-i18n.mjs
 *
 * Write missing default-locale rows:
 *   node scripts/audit-content-i18n.mjs --write
 *
 * Reads DATABASE_URL from the environment or apps/backend/.env.local. The script
 * is additive only: it inserts missing default-locale rows for existing
 * pages/segments and never updates or deletes existing translation data.
 */

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const DEFAULT_LOCALE = "en";
const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const json = args.has("--json");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/audit-content-i18n.mjs [--write] [--json]

Options:
  --write   Insert missing default-locale translation rows.
  --json    Print the report as JSON.
  --help    Show this help text.
`);
  process.exit(0);
}

function countRows(rows) {
  return Number(rows[0]?.count ?? 0);
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

async function readDatabaseUrlFromEnvFile(path) {
  try {
    const contents = await readFile(path, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      if (key !== "DATABASE_URL") continue;

      const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
      return value.length > 0 ? value : undefined;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return undefined;
}

async function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const localDatabaseUrl = await readDatabaseUrlFromEnvFile("apps/backend/.env.local");
  if (localDatabaseUrl) {
    process.env.DATABASE_URL = localDatabaseUrl;
    return localDatabaseUrl;
  }

  return undefined;
}

function compactPage(row) {
  return { slug: row.slug, title: row.title };
}

function compactSegment(row) {
  return {
    id: row.id,
    ownerSlug: row.owner_slug,
    targetSlug: row.target_slug,
    label: row.label,
  };
}

async function getCounts(client) {
  const pages = await client.query("SELECT COUNT(*)::int AS count FROM content_pages");
  const pageDefaultTranslations = await client.query(
    "SELECT COUNT(*)::int AS count FROM content_page_translations WHERE locale = $1",
    [DEFAULT_LOCALE],
  );
  const segments = await client.query("SELECT COUNT(*)::int AS count FROM page_segments");
  const segmentDefaultTranslations = await client.query(
    "SELECT COUNT(*)::int AS count FROM page_segment_translations WHERE locale = $1",
    [DEFAULT_LOCALE],
  );

  return {
    pages: countRows(pages.rows),
    pageDefaultTranslations: countRows(pageDefaultTranslations.rows),
    segments: countRows(segments.rows),
    segmentDefaultTranslations: countRows(segmentDefaultTranslations.rows),
  };
}

async function findMissing(client) {
  const pages = await client.query(
    `SELECT cp.slug, cp.title
         FROM content_pages cp
         LEFT JOIN content_page_translations cpt
           ON cpt.slug = cp.slug AND cpt.locale = $1
        WHERE cpt.slug IS NULL
        ORDER BY cp.slug`,
    [DEFAULT_LOCALE],
  );
  const segments = await client.query(
    `SELECT ps.id, ps.owner_slug, ps.target_slug, ps.label
         FROM page_segments ps
         LEFT JOIN page_segment_translations pst
           ON pst.segment_id = ps.id AND pst.locale = $1
        WHERE pst.segment_id IS NULL
        ORDER BY ps.owner_slug, ps.position, ps.id`,
    [DEFAULT_LOCALE],
  );

  return {
    pages: pages.rows,
    segments: segments.rows,
  };
}

async function backfillMissing(client) {
  await client.query(
    `INSERT INTO content_page_translations
       (slug, locale, title, content, source_updated_at, updated_at)
     SELECT cp.slug, $1, cp.title, cp.content, cp.content_updated_at, NOW()
       FROM content_pages cp
      WHERE NOT EXISTS (
        SELECT 1
          FROM content_page_translations cpt
         WHERE cpt.slug = cp.slug AND cpt.locale = $1
      )`,
    [DEFAULT_LOCALE],
  );

  await client.query(
    `INSERT INTO page_segment_translations
       (segment_id, locale, label, source_updated_at, updated_at)
     SELECT ps.id, $1, ps.label, ps.label_updated_at, NOW()
       FROM page_segments ps
      WHERE NOT EXISTS (
        SELECT 1
          FROM page_segment_translations pst
         WHERE pst.segment_id = ps.id AND pst.locale = $1
      )`,
    [DEFAULT_LOCALE],
  );
}

function buildReport({ beforeCounts, beforeMissing, afterCounts, afterMissing }) {
  const totalMissingBefore = beforeMissing.pages.length + beforeMissing.segments.length;
  const totalMissingAfter = afterMissing.pages.length + afterMissing.segments.length;

  return {
    mode: write ? "write" : "dry-run",
    defaultLocale: DEFAULT_LOCALE,
    status: totalMissingAfter === 0 ? (write ? "clean-after-write" : "clean") : "missing-default-translations",
    counts: {
      before: beforeCounts,
      after: afterCounts,
    },
    missingBefore: {
      pages: beforeMissing.pages.map(compactPage),
      segments: beforeMissing.segments.map(compactSegment),
      total: totalMissingBefore,
    },
    missingAfter: {
      pages: afterMissing.pages.map(compactPage),
      segments: afterMissing.segments.map(compactSegment),
      total: totalMissingAfter,
    },
    writesPerformed: {
      pages: write ? beforeMissing.pages.length : 0,
      segments: write ? beforeMissing.segments.length : 0,
      total: write ? totalMissingBefore : 0,
    },
    conflicts: [],
    skipped: [],
  };
}

function printReport(report) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Content i18n audit (${report.mode})`);
  console.log(`Default locale: ${report.defaultLocale}`);
  console.log(`Status: ${report.status}`);
  console.log("");
  console.log(`Pages: ${report.counts.before.pages}`);
  console.log(`Default page translations: ${report.counts.before.pageDefaultTranslations}`);
  console.log(`Segments: ${report.counts.before.segments}`);
  console.log(`Default segment translations: ${report.counts.before.segmentDefaultTranslations}`);
  console.log("");
  console.log(`Missing before: ${report.missingBefore.total}`);
  console.log(`Missing after: ${report.missingAfter.total}`);
  if (!write && report.missingBefore.total > 0) {
    console.log("Run with --write to insert missing default-locale rows.");
  }
}

async function main() {
  const databaseUrl = await loadDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const requireFromBackend = createRequire(new URL("../apps/backend/package.json", import.meta.url));
  const pg = requireFromBackend("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const beforeCounts = await getCounts(client);
    const beforeMissing = await findMissing(client);

    if (write && beforeMissing.pages.length + beforeMissing.segments.length > 0) {
      await client.query("BEGIN");
      try {
        await backfillMissing(client);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    const afterCounts = await getCounts(client);
    const afterMissing = await findMissing(client);
    const report = buildReport({ beforeCounts, beforeMissing, afterCounts, afterMissing });
    printReport(report);

    if (write && report.missingAfter.total > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
