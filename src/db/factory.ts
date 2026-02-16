import type { TrackRepository } from "./repository.js";
import type { DatabaseConfig } from "./config.js";

export async function createRepository(config: DatabaseConfig): Promise<TrackRepository> {
  switch (config.dialect) {
    case "sqlite": {
      const { SqliteAdapter } = await import("./adapters/sqlite.js");
      return new SqliteAdapter(config.path);
    }

    case "postgres": {
      const { PostgresAdapter } = await import("./adapters/postgres.js");
      return new PostgresAdapter(config.connectionString);
    }

    case "mysql": {
      const { MysqlAdapter } = await import("./adapters/mysql.js");
      return new MysqlAdapter(config);
    }

    default:
      throw new Error(`Unsupported database dialect: ${(config as { dialect: string }).dialect}`);
  }
}
