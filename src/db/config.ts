export interface DatabaseConfig {
  path: string;
}

/**
 * Reads a config value from runtime env (process.env) first,
 * then falls back to build-time env (import.meta.env).
 * Zerops/Docker set env vars at runtime, which only appear in process.env.
 */
function env(key: string): string | undefined {
  return process.env[key] || (import.meta.env[key] as string | undefined);
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    path: env("DATABASE_PATH") || "data/music.db",
  };
}
