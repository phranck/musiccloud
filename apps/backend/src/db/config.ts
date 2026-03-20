export interface DatabaseConfig {
  url: string;
}

function env(key: string): string | undefined {
  return process.env[key];
}

export function loadDatabaseConfig(): DatabaseConfig {
  const url = env("DATABASE_URL");
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is required (e.g., postgresql://user:password@localhost:5432/musiccloud)",
    );
  }
  return { url };
}
