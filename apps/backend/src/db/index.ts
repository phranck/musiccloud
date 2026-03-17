import { log } from "../lib/infra/logger";
import { PostgresAdapter } from "./adapters/postgres.js";
import type { AdminRepository } from "./admin-repository.js";
import { loadDatabaseConfig } from "./config.js";
import type { TrackRepository } from "./repository.js";

let repositoryInstance: PostgresAdapter | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Returns the singleton TrackRepository instance, creating it on first call. */
export async function getRepository(): Promise<TrackRepository> {
  await ensureInstance();
  return repositoryInstance!;
}

/** Returns the singleton AdminRepository instance, creating it on first call. */
export async function getAdminRepository(): Promise<AdminRepository> {
  await ensureInstance();
  return repositoryInstance!;
}

async function ensureInstance(): Promise<void> {
  if (!repositoryInstance) {
    const config = loadDatabaseConfig();
    repositoryInstance = new PostgresAdapter(config.url);

    // Verify database schema exists
    await repositoryInstance.ensureSchema();
    log.debug("DB", `Repository initialized (PostgreSQL)`);

    // Schedule cache cleanup
    repositoryInstance.scheduleCleanup();
  }
}

/** Graceful shutdown: close the database connection and stop cleanup. */
export async function closeRepository(): Promise<void> {
  if (repositoryInstance) {
    await repositoryInstance.close();
    repositoryInstance = null;
  }
}

// Re-export types for consumers
export type { AdminRepository, AdminUser } from "./admin-repository.js";
export type { CachedTrackResult, PersistTrackData, SharePageDbResult, TrackRepository } from "./repository.js";
