import { loadDatabaseConfig } from "./config.js";
import { createRepository } from "./factory.js";
import type { TrackRepository } from "./repository.js";
import { log } from "../lib/logger.js";

let repositoryInstance: TrackRepository | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Returns the singleton TrackRepository instance, creating it on first call. */
export async function getRepository(): Promise<TrackRepository> {
  if (!repositoryInstance) {
    const config = loadDatabaseConfig();
    repositoryInstance = await createRepository(config);
    log.debug("DB", `Repository initialized (${config.dialect})`);

    // Schedule cache cleanup every 6 hours
    cleanupInterval = setInterval(async () => {
      try {
        const deleted = await repositoryInstance!.cleanupStaleCache();
        if (deleted > 0) {
          log.debug("DB", `Cache cleanup removed ${deleted} stale entries`);
        }
      } catch (error) {
        log.error("DB", "Cache cleanup error:", error);
      }
    }, 6 * 60 * 60 * 1000);
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
export type { TrackRepository, CachedTrackResult, SharePageDbResult, PersistTrackData } from "./repository.js";
