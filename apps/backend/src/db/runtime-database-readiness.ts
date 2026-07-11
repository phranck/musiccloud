import pg from "pg";

import { loadDatabaseConfig } from "./config.js";
import { type DatabaseReadinessReport, inspectMusiccloudDatabase } from "./database-readiness.js";
import { resolveMigrationsFolder } from "./run-migrations.js";

let readinessPool: pg.Pool | null = null;

export async function getRuntimeDatabaseReadinessReport(): Promise<DatabaseReadinessReport> {
  const config = loadDatabaseConfig();
  readinessPool ??= new pg.Pool({ connectionString: config.url, max: 2 });
  return inspectMusiccloudDatabase(readinessPool, resolveMigrationsFolder(), process.env.DB_MIGRATION_ROLE?.trim());
}

export async function closeRuntimeDatabaseReadinessPool(): Promise<void> {
  if (!readinessPool) return;
  const pool = readinessPool;
  readinessPool = null;
  await pool.end();
}
