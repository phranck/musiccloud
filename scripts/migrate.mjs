/**
 * Drizzle migration runner for Postgres.
 *
 * Uses Drizzle's migrator and its drizzle.__drizzle_migrations table.
 *
 * Usage: node scripts/migrate.mjs
 * Requires DATABASE_URL environment variable.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "apps", "backend", "src", "db", "migrations", "postgres");
const requireFromBackend = createRequire(new URL("../apps/backend/package.json", import.meta.url));
const pg = requireFromBackend("pg");
const { drizzle } = requireFromBackend("drizzle-orm/node-postgres");
const { migrate: drizzleMigrate } = requireFromBackend("drizzle-orm/node-postgres/migrator");

function shouldUseSsl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const sslMode = parsed.searchParams.get("sslmode") ?? process.env.PGSSLMODE;
  if (sslMode === "disable") return false;
  if (sslMode === "require" || sslMode === "prefer") return true;
  return !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    const db = drizzle(client);
    await drizzleMigrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("Drizzle migrations applied.");
  } finally {
    await client.end();
  }
}

migrate();
