#!/usr/bin/env node

/**
 * Read-only inventory for the dormant editorial translation tables.
 *
 * Canonical editorial reads and writes use only content_pages,
 * page_segments and nav_items. The legacy translation tables remain until
 * their gated destructive migration and are intentionally reachable only
 * from schema/history/readiness code and this audit.
 *
 * Usage:
 *   node scripts/audit-content-i18n.mjs [--json]
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/audit-content-i18n.mjs [--json]

Options:
  --json    Print the read-only inventory as JSON.
  --help    Show this help text.
`);
  process.exit(0);
}

const unsupported = [...args].filter((argument) => argument !== "--json");
if (unsupported.length > 0) {
  console.error(`Unsupported option: ${unsupported.join(", ")}. This audit is read-only.`);
  process.exit(1);
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) return value.slice(1, -1);
  return value;
}

async function readDatabaseUrlFromEnvFile(path) {
  try {
    const contents = await readFile(path, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1 || trimmed.slice(0, separatorIndex).trim() !== "DATABASE_URL") continue;
      const value = parseEnvValue(trimmed.slice(separatorIndex + 1));
      return value.length > 0 ? value : undefined;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return undefined;
}

async function loadDatabaseUrl() {
  return process.env.DATABASE_URL ?? readDatabaseUrlFromEnvFile("apps/backend/.env.local");
}

async function inventoryTable(client, table) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(array_agg(DISTINCT locale ORDER BY locale), ARRAY[]::text[]) AS locales
       FROM ${table}`,
  );
  return {
    rows: Number(result.rows[0]?.count ?? 0),
    locales: result.rows[0]?.locales ?? [],
  };
}

async function buildInventory(client) {
  const [pages, segments, navigation] = await Promise.all([
    inventoryTable(client, "content_page_translations"),
    inventoryTable(client, "page_segment_translations"),
    inventoryTable(client, "nav_item_translations"),
  ]);
  return {
    mode: "read-only",
    status: "dormant-legacy-storage",
    canonicalSources: ["content_pages", "page_segments", "nav_items"],
    legacyTables: {
      content_page_translations: pages,
      page_segment_translations: segments,
      nav_item_translations: navigation,
    },
  };
}

export async function runReadOnlyAudit(client) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const inventory = await buildInventory(client);
    await client.query("COMMIT");
    return inventory;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function printInventory(inventory) {
  if (json) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }
  console.log("Editorial translation storage audit (read-only)");
  console.log(`Status: ${inventory.status}`);
  for (const [table, entry] of Object.entries(inventory.legacyTables)) {
    console.log(`${table}: rows=${entry.rows} locales=${entry.locales.join(",") || "none"}`);
  }
}

async function main() {
  const databaseUrl = await loadDatabaseUrl();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const requireFromBackend = createRequire(new URL("../apps/backend/package.json", import.meta.url));
  const pg = requireFromBackend("pg");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    printInventory(await runReadOnlyAudit(client));
  } finally {
    await client.end();
  }
}

const isDirectEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectEntry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Editorial translation storage audit failed");
    process.exit(1);
  });
}
