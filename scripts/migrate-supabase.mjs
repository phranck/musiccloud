/**
 * Database migration runner for Supabase Postgres.
 *
 * Mirrors scripts/migrate.mjs (postgres) but:
 *   - Loads .env.local so developers can run `npm run db:supabase:migrate`
 *     without manually exporting env vars.
 *   - Reads SUPABASE_DB_URL instead of DATABASE_URL.
 *   - Applies SQL files from apps/backend/src/db/migrations/supabase/.
 *
 * Tracks applied migrations in a `_migrations` table (same pattern as postgres
 * side) and applies only pending ones in alphabetical order.
 *
 * Usage: node scripts/migrate-supabase.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "apps", "backend", "src", "db", "migrations", "supabase");

// Load .env.local (same pattern as apps/backend/start-dev.mjs)
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) process.env[key] ??= val;
  }
}

async function migrate() {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error("SUPABASE_DB_URL is required (add it to .env.local)");
    process.exit(1);
  }

  if (!existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory does not exist: ${MIGRATIONS_DIR}`);
    console.error("Run `npm run db:supabase:generate` first to create the baseline.");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query(`SELECT name FROM _migrations ORDER BY name`);
    const appliedSet = new Set(applied.map((r) => r.name));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      console.log(`Applying migration: ${file}`);

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        count++;
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`Migration ${file} failed:`, error);
        process.exit(1);
      }
    }

    if (count === 0) {
      console.log("No pending migrations.");
    } else {
      console.log(`Applied ${count} migration(s).`);
    }
  } finally {
    await client.end();
  }
}

migrate();
