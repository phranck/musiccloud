import { existsSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

import { loadDatabaseConfig } from "./config.js";
import { assertDatabaseReady, inspectMusiccloudDatabase } from "./database-readiness.js";
import { backfillDeveloperProjects } from "./developer-project-backfill.js";
import { assertSafeMigrationConnection } from "./migration-safety.js";
import { backfillTierOffers } from "./tier-offers-backfill.js";

export function resolveMigrationsFolder(): string {
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

  throw new Error(`Drizzle migrations folder not found. Checked:\n${candidates.map((c) => `  ${c}`).join("\n")}`);
}

export async function runMigrations(options: { ensureAdminOwner?: boolean } = {}): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();
  const config = loadDatabaseConfig();
  const pool = new pg.Pool({ connectionString: config.url });

  try {
    const identity = await assertSafeMigrationConnection(pool, config.url, process.env.DB_MIGRATION_ROLE?.trim());
    console.log(
      `[DB] Migration identity verified: database=${identity.currentDatabase} role=${identity.currentUser} host=${identity.connectionHost}`,
    );

    const db = drizzle(pool);
    console.log(`[DB] Running migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });

    const projectBackfill = await backfillDeveloperProjects(pool);
    console.log(
      `[DB] Developer project ownership verified: clientProjects=${projectBackfill.clientProjectsInserted} accountProjects=${projectBackfill.accountProjectsInserted}`,
    );

    const offerBackfill = await backfillTierOffers(pool);
    console.log(
      `[DB] Plan offers verified: monthly=${offerBackfill.monthlyOffersInserted} yearly=${offerBackfill.yearlyOffersInserted} unreadable=${offerBackfill.unreadablePrices}`,
    );
    if (offerBackfill.unreadablePrices > 0) {
      // Not fatal: the plan simply has nothing to sell until somebody enters a
      // price. Silent would be wrong, because the pricing page looks the same.
      console.warn(
        `[DB] ${offerBackfill.unreadablePrices} plan price(s) could not be read as an amount and produced no offer.`,
      );
    }

    if (options.ensureAdminOwner !== false) {
      // Ensure there is at least one owner (promote the first user if none exists)
      const { rows } = await pool.query(`SELECT COUNT(*) AS c FROM admin_users WHERE role = 'owner'`);
      if (Number(rows[0]?.c) === 0) {
        await pool.query(
          `UPDATE admin_users SET role = 'owner'
           WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1)`,
        );
      }
    }

    const readiness = await inspectMusiccloudDatabase(pool, migrationsFolder, identity.currentUser);
    assertDatabaseReady(readiness);

    console.log("[DB] All migrations applied successfully");
  } catch (err) {
    // Crash hard: a partially-migrated DB schema with new application code
    // produces silent data-shape corruption (e.g. SELECTs on a table that
    // never got created). Container restart-loop in Zerops is loud and
    // visible; a zombie backend serving 500s is not.
    console.error("[DB] Migration failed:", (err as Error).message);
    throw err;
  } finally {
    await pool.end();
  }
}
