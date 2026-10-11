import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeIntegrationDatabase } from "../__tests__/integration-database.js";
import { resolveMigrationsFolder } from "../db/run-migrations.js";

const MIGRATION_TAG = "0100_developer_portal_availability_events";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

const session = vi.hoisted(() => ({ client: null as import("pg").Client | null }));

// The service reaches the database through the shared pool. Here the pool is
// this test's one session, so every query, the service's own transaction
// included, sees the temporary tables created below.
vi.mock("../db/pool.js", () => {
  const client = () => {
    if (!session.client) throw new Error("The integration session is not connected.");
    return session.client;
  };
  return {
    getDatabasePool: () => ({
      query: (text: string, values?: unknown[]) => client().query(text, values),
      connect: async () => ({
        query: (text: string, values?: unknown[]) => client().query(text, values),
        release: () => undefined,
      }),
    }),
  };
});

const { readLastPortalAvailabilityChange, readPortalAvailability, writePortalAvailability } = await import(
  "./developer-portal-availability.js"
);

/**
 * The service is held to what the dashboard and the portal gate rely on: a
 * change is recorded with its owner, a write that changes nothing records
 * nothing, and a failed write leaves the switches as they were.
 *
 * Every table it touches is a temporary copy that shadows the real one for
 * this session only, and the events table is created from the generated
 * migration itself, so no stored row is read or written.
 */
describe.skipIf(!isSafeIntegrationDatabase(process.env.DATABASE_URL))(
  "developer portal availability (integration)",
  () => {
    let client: pg.Client;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      session.client = client;

      await client.query("CREATE TEMP TABLE site_settings (LIKE public.site_settings INCLUDING ALL)");
      await client.query("CREATE TEMP TABLE admin_users (LIKE public.admin_users INCLUDING ALL)");
      // A temporary table may only reference temporary tables, so the foreign
      // key points at the temporary admin_users rather than the public one.
      const migration = (await readFile(path.join(resolveMigrationsFolder(), `${MIGRATION_TAG}.sql`), "utf8"))
        .replace(
          'CREATE TABLE "developer_portal_availability_events"',
          'CREATE TEMP TABLE "developer_portal_availability_events"',
        )
        .replace('REFERENCES "public"."admin_users"', 'REFERENCES "admin_users"');
      for (const statement of migration.split(STATEMENT_BREAKPOINT)) {
        await client.query(statement);
      }

      const shadowing = await client.query<{ settings: boolean; admins: boolean; events: boolean }>(
        `SELECT 'site_settings'::regclass = 'pg_temp.site_settings'::regclass AS settings,
                'admin_users'::regclass = 'pg_temp.admin_users'::regclass AS admins,
                'developer_portal_availability_events'::regclass = 'pg_temp.developer_portal_availability_events'::regclass AS events`,
      );
      // The cases below may only run once every unqualified name resolves to a
      // temporary copy.
      expect(shadowing.rows[0]).toEqual({ settings: true, admins: true, events: true });
    });

    beforeEach(async () => {
      await client.query("TRUNCATE pg_temp.developer_portal_availability_events, pg_temp.site_settings");
      await client.query("DELETE FROM pg_temp.admin_users");
      await client.query(
        `INSERT INTO pg_temp.admin_users (id, username, password_hash, role, first_name, last_name, created_at) VALUES
           ('owner-a', 'olive', 'hash', 'owner', 'Olive', 'Owner', now()),
           ('owner-b', 'oscar', 'hash', 'owner', NULL, NULL, now())`,
      );
    });

    afterAll(async () => {
      session.client = null;
      await client.end();
    });

    async function eventCount(): Promise<number> {
      const result = await client.query<{ count: string }>(
        "SELECT count(*) FROM pg_temp.developer_portal_availability_events",
      );
      return Number(result.rows[0]?.count);
    }

    it("reads missing settings as a closed portal with no recorded change", async () => {
      await expect(readPortalAvailability()).resolves.toEqual({ public: false, maintenance: false });
      await expect(readLastPortalAvailabilityChange()).resolves.toBeNull();
    });

    it("opens only on the exact string true", async () => {
      await client.query(
        `INSERT INTO pg_temp.site_settings (key, value, updated_at) VALUES
           ('developer_portal_public', 'TRUE', now()),
           ('developer_portal_maintenance', '1', now())`,
      );
      await expect(readPortalAvailability()).resolves.toEqual({ public: false, maintenance: false });
    });

    it("records a change with the owner who made it, and reads it back as the newest", async () => {
      const state = await writePortalAvailability({ public: true, maintenance: false }, "owner-a");

      expect(state).toMatchObject({
        public: true,
        maintenance: false,
        lastChange: {
          public: true,
          maintenance: false,
          actor: { username: "olive", firstName: "Olive", lastName: "Owner" },
        },
      });
      expect(Number.isNaN(Date.parse(state.lastChange?.occurredAt ?? ""))).toBe(false);
      expect(await eventCount()).toBe(1);
    });

    it("records nothing for a write that leaves the state as it was", async () => {
      await writePortalAvailability({ public: true, maintenance: false }, "owner-a");
      const state = await writePortalAvailability({ public: true, maintenance: false }, "owner-b");

      expect(await eventCount()).toBe(1);
      expect(state.lastChange?.actor.username).toBe("olive");
    });

    it("names the owner of the newest change once a second one follows", async () => {
      await writePortalAvailability({ public: true, maintenance: false }, "owner-a");
      await client.query(
        "UPDATE pg_temp.developer_portal_availability_events SET occurred_at = now() - interval '1 day'",
      );
      const state = await writePortalAvailability({ public: false, maintenance: true }, "owner-b");

      expect(await eventCount()).toBe(2);
      expect(state).toMatchObject({
        public: false,
        maintenance: true,
        lastChange: { public: false, maintenance: true, actor: { username: "oscar", firstName: null, lastName: null } },
      });
    });

    it("leaves both switches and the record untouched when the write fails", async () => {
      await writePortalAvailability({ public: false, maintenance: true }, "owner-a");

      await expect(writePortalAvailability({ public: true, maintenance: false }, "nobody")).rejects.toThrow();

      await expect(readPortalAvailability()).resolves.toEqual({ public: false, maintenance: true });
      expect(await eventCount()).toBe(1);
    });
  },
);
