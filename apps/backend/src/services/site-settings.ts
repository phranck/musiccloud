/**
 * @file Key/value store for low-volume site-wide settings.
 *
 * Deliberately thin: three functions over a single `site_settings` table.
 * Used so far for operational flags surfaced to the admin UI and exposed
 * selectively to SSR (see `routes/site-settings.ts`). Not intended for
 * user-scoped or per-tenant data.
 *
 * Settings traffic is sporadic, so the reads go through the shared runtime
 * pool (`db/pool.ts`), where a connection kept warm by other traffic is
 * waiting, rather than through a pool of their own that idles out between
 * page renders.
 */

import { type DesignTokens, parseDesignTokens } from "@musiccloud/shared";
import { getDatabasePool } from "../db/pool.js";

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
  const result = await getDatabasePool().query("SELECT key, value FROM site_settings");
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
  const result = await getDatabasePool().query("SELECT value FROM site_settings WHERE key = $1", [key]);
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
  await getDatabasePool().query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  );
}

/**
 * The key the design-token blob is stored under.
 *
 * The tokens decide what every glass surface looks like, on the site and in an
 * email alike, so both read them from here rather than each naming the key.
 */
export const DESIGN_TOKENS_KEY = "design_tokens";

/**
 * Reads the stored design tokens, validated.
 *
 * `parseDesignTokens` fills anything missing or invalid with the canonical
 * default, so this always returns a complete set and a caller never has to
 * decide what to do without one.
 *
 * @returns The validated token set.
 */
export async function getDesignTokens(): Promise<DesignTokens> {
  const raw = await getSetting(DESIGN_TOKENS_KEY);
  return parseDesignTokens(raw).tokens;
}
