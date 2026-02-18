import { log } from "../lib/infra/logger";
import { SqliteAdapter } from "./adapters/sqlite.js";
import type { AdminRepository } from "./admin-repository.js";
import { loadDatabaseConfig } from "./config.js";
import type { TrackRepository } from "./repository.js";

let repositoryInstance: SqliteAdapter | null = null;
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
    repositoryInstance = new SqliteAdapter(config.path);
    log.debug("DB", `Repository initialized (SQLite: ${config.path})`);

    // Schedule cache cleanup every 6 hours
    cleanupInterval = setInterval(
      async () => {
        try {
          const deleted = await repositoryInstance!.cleanupStaleCache();
          if (deleted > 0) {
            log.debug("DB", `Cache cleanup removed ${deleted} stale entries`);
          }
        } catch (error) {
          log.error("DB", "Cache cleanup error:", error);
        }
      },
      6 * 60 * 60 * 1000,
    );
  }
}

/** Graceful shutdown: close the database connection and stop cleanup. */
export async function closeRepository(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (repositoryInstance) {
    await repositoryInstance.close();
    repositoryInstance = null;
  }
}

// Re-export types for consumers
export type { AdminRepository, AdminUser } from "./admin-repository.js";
export type { CachedTrackResult, PersistTrackData, SharePageDbResult, TrackRepository } from "./repository.js";
