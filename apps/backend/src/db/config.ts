export interface DatabaseConfig {
  path: string;
}

function env(key: string): string | undefined {
  return process.env[key];
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    path: env("DATABASE_PATH") || "data/music.db",
  };
}
