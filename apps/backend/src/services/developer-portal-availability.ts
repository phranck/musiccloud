/**
 * @file Whether the developer portal is open, and the record of who changed that.
 *
 * The state is two `site_settings` rows. The portal middleware reads them on
 * every request through the internal route and serves the gate page unless the
 * portal is public, so flipping them takes effect without a deploy. One click
 * in the dashboard writes them, which is why every change is also written to
 * `developer_portal_availability_events`: without that row nothing says since
 * when the portal has been open or who opened it.
 */
import { nanoid } from "nanoid";

import { getDatabasePool } from "../db/pool.js";
import { setSetting } from "./site-settings.js";

const PORTAL_PUBLIC_KEY = "developer_portal_public";
const PORTAL_MAINTENANCE_KEY = "developer_portal_maintenance";

/** The two switches behind the portal gate. */
export interface DeveloperPortalAvailability {
  /** The gate page answers with 503 and a maintenance notice, whatever `public` says. */
  maintenance: boolean;
  /** The portal serves its pages, including registration. */
  public: boolean;
}

/** The admin who made a change, as the dashboard needs it to name them. */
export interface DeveloperPortalAvailabilityActor {
  username: string;
  firstName: string | null;
  lastName: string | null;
}

/** One recorded change: the state an owner set, when, and who it was. */
export interface DeveloperPortalAvailabilityChange extends DeveloperPortalAvailability {
  /** ISO 8601 timestamp of the change. */
  occurredAt: string;
  actor: DeveloperPortalAvailabilityActor;
}

/** The current state together with the change that produced it. */
export interface DeveloperPortalAvailabilityState extends DeveloperPortalAvailability {
  /** The newest recorded change, or `null` before the first one. */
  lastChange: DeveloperPortalAvailabilityChange | null;
}

interface SettingRow {
  key: string;
  value: string;
}

interface ChangeRow {
  public: boolean;
  maintenance: boolean;
  occurred_at: Date;
  username: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Turns the stored setting rows into the two switches.
 *
 * Only the exact string `"true"` opens anything, so a missing row or any other
 * value keeps the portal closed. The middleware fails closed on a read error as
 * well, which makes closed the answer to every doubt.
 *
 * @param rows - The `site_settings` rows for the two keys; either may be absent.
 * @returns The availability those rows describe.
 */
function toAvailability(rows: SettingRow[]): DeveloperPortalAvailability {
  const storedValue = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    public: storedValue(PORTAL_PUBLIC_KEY) === "true",
    maintenance: storedValue(PORTAL_MAINTENANCE_KEY) === "true",
  };
}

/**
 * Reads the two switches the portal middleware acts on.
 *
 * @returns The current availability.
 */
export async function readPortalAvailability(): Promise<DeveloperPortalAvailability> {
  const result = await getDatabasePool().query<SettingRow>(
    "SELECT key, value FROM site_settings WHERE key = ANY($1::text[])",
    [[PORTAL_PUBLIC_KEY, PORTAL_MAINTENANCE_KEY]],
  );
  return toAvailability(result.rows);
}

/**
 * Reads the newest recorded change with the admin who made it.
 *
 * @returns The change, or `null` while none has been recorded.
 */
export async function readLastPortalAvailabilityChange(): Promise<DeveloperPortalAvailabilityChange | null> {
  const result = await getDatabasePool().query<ChangeRow>(
    `SELECT change."public", change.maintenance, change.occurred_at,
            actor.username, actor.first_name, actor.last_name
     FROM developer_portal_availability_events change
     JOIN admin_users actor ON actor.id = change.actor_admin_id
     ORDER BY change.occurred_at DESC
     LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    public: row.public,
    maintenance: row.maintenance,
    occurredAt: new Date(row.occurred_at).toISOString(),
    actor: { username: row.username, firstName: row.first_name, lastName: row.last_name },
  };
}

/**
 * Reads the current availability and the change that produced it.
 *
 * @returns What the dashboard shows on the availability card.
 */
export async function readPortalAvailabilityState(): Promise<DeveloperPortalAvailabilityState> {
  const [availability, lastChange] = await Promise.all([readPortalAvailability(), readLastPortalAvailabilityChange()]);
  return { ...availability, lastChange };
}

/**
 * Stores a new availability and records the change.
 *
 * Both switches and the event row are written in one transaction, so the
 * portal is never left half switched and a change is never stored without its
 * record. The setting rows are locked while the previous state is read, so two
 * owners saving at once cannot both see the old state and both record a
 * change. A write that leaves the state as it was records nothing.
 *
 * @param next - The availability to store.
 * @param actorAdminId - The owner who made the change.
 * @returns The stored state with its newest change.
 * @throws Database errors propagate after the transaction is rolled back.
 */
export async function writePortalAvailability(
  next: DeveloperPortalAvailability,
  actorAdminId: string,
): Promise<DeveloperPortalAvailabilityState> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const previous = toAvailability(
      (
        await client.query<SettingRow>("SELECT key, value FROM site_settings WHERE key = ANY($1::text[]) FOR UPDATE", [
          [PORTAL_PUBLIC_KEY, PORTAL_MAINTENANCE_KEY],
        ])
      ).rows,
    );
    await setSetting(PORTAL_PUBLIC_KEY, String(next.public), client);
    await setSetting(PORTAL_MAINTENANCE_KEY, String(next.maintenance), client);
    if (previous.public !== next.public || previous.maintenance !== next.maintenance) {
      await client.query(
        `INSERT INTO developer_portal_availability_events (id, actor_admin_id, "public", maintenance)
         VALUES ($1, $2, $3, $4)`,
        [nanoid(), actorAdminId, next.public, next.maintenance],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return readPortalAvailabilityState();
}
