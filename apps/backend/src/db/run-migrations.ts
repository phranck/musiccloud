import path from "node:path";
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { loadDatabaseConfig } from "./config.js";

function resolveMigrationsFolder(): string {
  const candidates = [
    path.resolve(__dirname, "migrations", "postgres"),
    path.resolve(__dirname, "..", "db", "migrations", "postgres"),
    path.resolve(process.cwd(), "apps/backend/src/db/migrations/postgres"),
    path.resolve(process.cwd(), "src/db/migrations/postgres"),
  ];

  for (const folder of candidates) {
    if (existsSync(path.join(folder, "meta", "_journal.json"))) {
      return folder;
    }
  }

  throw new Error(
    `Drizzle migrations folder not found. Checked:\n${candidates.map((c) => `  ${c}`).join("\n")}`,
  );
}

export async function runMigrations(): Promise<void> {
  let migrationsFolder: string;
  try {
    migrationsFolder = resolveMigrationsFolder();
  } catch (err) {
    console.error("[DB] Migration folder resolution failed:", (err as Error).message);
    console.error("[DB] cwd:", process.cwd());
    console.error("[DB] __dirname:", __dirname);
    return;
  }

  const config = loadDatabaseConfig();
  const pool = new pg.Pool({ connectionString: config.url });
  const db = drizzle(pool);

  try {
    console.log(`[DB] Running migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });

    // Ensure the first admin user is always owner
    await pool.query(
      `UPDATE admin_users SET role = 'owner'
       WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1)
         AND role != 'owner'`
    );

    console.log("[DB] All migrations applied successfully");
  } catch (err) {
    console.error("[DB] Migration failed:", (err as Error).message);
  } finally {
    await pool.end();
  }
}
