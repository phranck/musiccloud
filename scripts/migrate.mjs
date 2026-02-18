/**
 * Database migration runner for Postgres (production).
 *
 * Reads SQL files from src/db/migrations/postgres/ in order,
 * tracks applied migrations in a _migrations table,
 * and applies only pending ones.
 *
 * Usage: node scripts/migrate.mjs
 * Requires DATABASE_URL environment variable.
 */

import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "apps", "backend", "src", "db", "migrations", "postgres");

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already applied migrations
    const { rows: applied } = await client.query(`SELECT name FROM _migrations ORDER BY name`);
    const appliedSet = new Set(applied.map((r) => r.name));

    // Read migration files in order
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
