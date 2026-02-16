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

export function loadDatabaseConfig(): DatabaseConfig {
  const dialect = (import.meta.env.DATABASE_TYPE || "sqlite") as DbDialect;

  switch (dialect) {
    case "sqlite":
      return {
        dialect: "sqlite",
        path: import.meta.env.DATABASE_PATH || "data/music.db",
      };

    case "postgres":
      return {
        dialect: "postgres",
        connectionString: import.meta.env.DATABASE_URL || "postgresql://localhost/music",
      };

    case "mysql":
      return {
        dialect: "mysql",
        host: import.meta.env.DATABASE_HOST || "localhost",
        port: Number(import.meta.env.DATABASE_PORT) || 3306,
        user: import.meta.env.DATABASE_USER || "root",
        password: import.meta.env.DATABASE_PASSWORD || "",
        database: import.meta.env.DATABASE_NAME || "music",
      };

    default:
      throw new Error(`Unsupported database dialect: ${dialect}`);
  }
}
