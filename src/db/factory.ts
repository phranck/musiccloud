import type { TrackRepository } from "./repository.js";
import type { DatabaseConfig } from "./config.js";

export async function createRepository(config: DatabaseConfig): Promise<TrackRepository> {
  switch (config.dialect) {
    case "sqlite": {
      const { SqliteAdapter } = await import("./adapters/sqlite.js");
      return new SqliteAdapter(config.path);
    }

    case "postgres":
      throw new Error("PostgreSQL adapter not yet implemented. Coming in Phase 2.");

    case "mysql":
      throw new Error("MySQL adapter not yet implemented. Coming in Phase 3.");

    default:
      throw new Error(`Unsupported database dialect: ${(config as { dialect: string }).dialect}`);
  }
}
