import type pg from "pg";

import { loadDatabaseConfig } from "./config.js";
import { type DatabaseReadinessReport, inspectMusiccloudDatabase } from "./database-readiness.js";
import { createDatabasePool } from "./pool.js";
import { resolveMigrationsFolder } from "./run-migrations.js";

const READINESS_POOL_MAX_CONNECTIONS = 2;

let readinessPool: pg.Pool | null = null;

export async function getRuntimeDatabaseReadinessReport(): Promise<DatabaseReadinessReport> {
  const config = loadDatabaseConfig();
  readinessPool ??= createDatabasePool(config.url, READINESS_POOL_MAX_CONNECTIONS);
  return inspectMusiccloudDatabase(readinessPool, resolveMigrationsFolder(), process.env.DB_MIGRATION_ROLE?.trim());
}

export async function closeRuntimeDatabaseReadinessPool(): Promise<void> {
  if (!readinessPool) return;
  const pool = readinessPool;
  readinessPool = null;
  await pool.end();
}
