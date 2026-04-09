import * as pgModule from "pg";
import { loadDatabaseConfig } from "../db/config.js";

const Pool = (pgModule as unknown as { default: typeof pgModule }).default?.Pool ?? pgModule.Pool;

let pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const config = loadDatabaseConfig();
    pool = new Pool({ connectionString: config.url, max: 2 });
  }
  return pool;
}

export interface SiteSettings {
  [key: string]: string;
}

/** Get all site settings as a key/value object. */
export async function getAllSettings(): Promise<SiteSettings> {
  const result = await getPool().query("SELECT key, value FROM site_settings");
  const settings: SiteSettings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/** Get a single setting by key. */
export async function getSetting(key: string): Promise<string | null> {
  const result = await getPool().query("SELECT value FROM site_settings WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}

/** Upsert a single setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}
