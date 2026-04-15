/**
 * @file Key/value store for low-volume site-wide settings.
 *
 * Deliberately thin: three functions over a single `site_settings` table.
 * Used so far for operational flags surfaced to the admin UI and exposed
 * selectively to SSR (see `routes/site-settings.ts`). Not intended for
 * user-scoped or per-tenant data.
 *
 * ## Own connection pool, capped at 2
 *
 * Settings traffic is sporadic (admin toggles, SSR reads once per page
 * render) so this module maintains its own tiny pool instead of pulling
 * from the main application pool. The cap prevents these rare calls from
 * competing for connections with the resolve hot path under load.
 *
 * ## `pg` dual-module import
 *
 * `pg` ships both CommonJS and ESM entry points. Depending on which side
 * picks it up at runtime, `pgModule.default` may or may not exist. The
 * `pgModule.default?.Pool ?? pgModule.Pool` fallback works in both, which
 * is why the import is destructured this way instead of just
 * `import { Pool } from "pg"`.
 */
import * as pgModule from "pg";
import { loadDatabaseConfig } from "../db/config.js";

const Pool = (pgModule as unknown as { default: typeof pgModule }).default?.Pool ?? pgModule.Pool;

let pool: InstanceType<typeof Pool> | null = null;

/**
 * Lazily constructs the dedicated `pg` pool. Lazy so module import does
 * not require env vars to be set (tests and scripts can import without a
 * live DB), and so a single misconfigured connection string does not
 * crash app startup.
 *
 * @returns the singleton pool used by all three exported functions
 */
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

/**
 * Loads every row in `site_settings` and flattens it into a plain object.
 * Called by the admin CRUD route to render the full settings UI.
 *
 * @returns a plain key/value map; empty object if no settings exist
 */
export async function getAllSettings(): Promise<SiteSettings> {
  const result = await getPool().query("SELECT key, value FROM site_settings");
  const settings: SiteSettings = {};
  for (const row of result.rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

/**
 * Reads a single setting by key. The public SSR path uses this for a
 * small number of well-known flags (e.g. `tracking_enabled`) rather than
 * pulling the whole map.
 *
 * @param key - setting name; arbitrary string, no whitelist enforced here
 * @returns the stored value, or `null` if the key does not exist
 */
export async function getSetting(key: string): Promise<string | null> {
  const result = await getPool().query("SELECT value FROM site_settings WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}

/**
 * Writes a setting, inserting when absent and updating when present
 * (`ON CONFLICT DO UPDATE`). Atomic at the SQL level, so two concurrent
 * writes on the same key cannot leave a partial row.
 *
 * @param key   - setting name; caller is responsible for any validation
 * @param value - value to store; all settings are string-typed
 */
export async function setSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}
