export type DbDialect = "sqlite" | "postgres" | "mysql";

export interface SqliteConfig {
  dialect: "sqlite";
  path: string;
}

export interface PostgresConfig {
  dialect: "postgres";
  connectionString: string;
}

export interface MysqlConfig {
  dialect: "mysql";
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export type DatabaseConfig = SqliteConfig | PostgresConfig | MysqlConfig;

/**
 * Reads a config value from runtime env (process.env) first,
 * then falls back to build-time env (import.meta.env).
 * Zerops/Docker set env vars at runtime, which only appear in process.env.
 */
function env(key: string): string | undefined {
  return process.env[key] || (import.meta.env[key] as string | undefined);
}

export function loadDatabaseConfig(): DatabaseConfig {
  const dialect = (env("DATABASE_TYPE") || "sqlite") as DbDialect;

  switch (dialect) {
    case "sqlite":
      return {
        dialect: "sqlite",
        path: env("DATABASE_PATH") || "data/music.db",
      };

    case "postgres":
      return {
        dialect: "postgres",
        connectionString: env("DATABASE_URL") || "postgresql://localhost/music",
      };

    case "mysql":
      return {
        dialect: "mysql",
        host: env("DATABASE_HOST") || "localhost",
        port: Number(env("DATABASE_PORT")) || 3306,
        user: env("DATABASE_USER") || "root",
        password: env("DATABASE_PASSWORD") || "",
        database: env("DATABASE_NAME") || "music",
      };

    default:
      throw new Error(`Unsupported database dialect: ${dialect}`);
  }
}
