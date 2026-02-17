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
      const adapter = new PostgresAdapter(config.connectionString);
      await adapter.ensureSchema();
      return adapter;
    }

    case "mysql": {
      const { MysqlAdapter } = await import("./adapters/mysql.js");
      const adapter = new MysqlAdapter(config);
      await adapter.ensureSchema();
      return adapter;
    }

    default:
      throw new Error(`Unsupported database dialect: ${(config as { dialect: string }).dialect}`);
  }
}
