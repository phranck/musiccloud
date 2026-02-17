import { log } from "../lib/logger.js";
import { SqliteAdapter } from "./adapters/sqlite.js";
import { loadDatabaseConfig } from "./config.js";
import type { TrackRepository } from "./repository.js";

let repositoryInstance: TrackRepository | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Returns the singleton TrackRepository instance, creating it on first call. */
export async function getRepository(): Promise<TrackRepository> {
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
  return repositoryInstance;
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
export type { CachedTrackResult, PersistTrackData, SharePageDbResult, TrackRepository } from "./repository.js";
