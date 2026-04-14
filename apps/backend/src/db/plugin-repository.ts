import { isValidServiceId, type ServiceId } from "@musiccloud/shared";
import * as pgModule from "pg";
import { loadDatabaseConfig } from "./config.js";

const Pool = (pgModule as unknown as { default: typeof pgModule }).default?.Pool ?? pgModule.Pool;

let pool: InstanceType<typeof Pool> | null = null;

function getPool(): InstanceType<typeof Pool> {
  if (!pool) {
    const config = loadDatabaseConfig();
    pool = new Pool({ connectionString: config.url, max: 2 });
  }
  return pool;
}

export interface PluginState {
  id: ServiceId;
  enabled: boolean;
  updatedAt: Date;
}

/**
 * Read all rows from `service_plugins`. The table is sparse — a plugin
 * without a row falls back to its `manifest.defaultEnabled`. Callers merge
 * these rows with the static plugin list in the registry.
 *
 * Invalid `id` values in the DB (e.g. legacy rows from removed services)
 * are filtered out; they can never match a valid plugin anyway.
 */
export async function readPluginStatesFromDb(): Promise<PluginState[]> {
  const result = await getPool().query<{ id: string; enabled: boolean; updated_at: Date }>(
    "SELECT id, enabled, updated_at FROM service_plugins",
  );
  const rows: PluginState[] = [];
  for (const row of result.rows) {
    if (!isValidServiceId(row.id)) continue;
    rows.push({ id: row.id, enabled: row.enabled, updatedAt: row.updated_at });
  }
  return rows;
}

/**
 * Upsert a single plugin's enabled state.
 *
 * Validates `id` against `isValidServiceId` before writing — never trust
 * the wire value (project rule: "No `as ServiceId` without validation.").
 */
export async function upsertPluginState(id: ServiceId, enabled: boolean): Promise<void> {
  if (!isValidServiceId(id)) {
    throw new Error(`Invalid ServiceId: ${id}`);
  }
  await getPool().query(
    `INSERT INTO service_plugins (id, enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET enabled = $2, updated_at = NOW()`,
    [id, enabled],
  );
}
