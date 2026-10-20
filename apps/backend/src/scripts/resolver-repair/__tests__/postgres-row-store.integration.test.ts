import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { integrationDatabaseUrl } from "../../../__tests__/integration-database.js";
import { applyManifest, verifyManifest } from "../engine.js";
import { invertManifest, type RowValues } from "../manifest.js";
import {
  type PostgresRowStore,
  RowStoreError,
  readNewestMigrationHash,
  withRepairTransaction,
} from "../postgres-row-store.js";
import { manifestOf } from "./memory-row-store.js";

const url = integrationDatabaseUrl();

/** The error code a promise rejects with, or `resolved`. */
async function rejectionOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "resolved";
  } catch (error) {
    return error instanceof RowStoreError ? error.code : error instanceof Error ? error.message : String(error);
  }
}

/**
 * These tests create their own temporary tables inside one session, so they cannot touch a row that belongs to
 * somebody else, and the tables vanish when the connection ends.
 */
describe.skipIf(!url)("the PostgreSQL row store on temporary tables", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    await client.query(
      "CREATE TEMP TABLE repair_parent (id text PRIMARY KEY, name text, tags text[], seen timestamptz, score double precision)",
    );
    await client.query(
      "CREATE TEMP TABLE repair_cascading (id text PRIMARY KEY, parent_id text REFERENCES repair_parent(id) ON DELETE CASCADE)",
    );
    await client.query(
      "CREATE TEMP TABLE repair_nullable (id text PRIMARY KEY, parent_id text REFERENCES repair_parent(id) ON DELETE SET NULL)",
    );
    await client.query(
      "CREATE TEMP TABLE repair_restricted (id text PRIMARY KEY, parent_id text REFERENCES repair_parent(id))",
    );
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("TRUNCATE repair_parent CASCADE");
    await client.query(
      "INSERT INTO repair_parent VALUES ('p1', 'First', ARRAY['a', 'b'], '2026-10-20T16:42:47.123+00:00', 0.7090909), ('p2', 'Second', NULL, NULL, NULL)",
    );
  });

  it("reads a row as JSON, with timestamps in UTC and arrays as arrays", async () => {
    const row = await withRepairTransaction(client, "read-only", (store) =>
      store.readRow({ table: "repair_parent", keyColumn: "id", keyValue: "p1" }, false),
    );
    expect(row).toEqual({
      id: "p1",
      name: "First",
      tags: ["a", "b"],
      seen: "2026-10-20T16:42:47.123+00:00",
      score: 0.7090909,
    });
  });

  it("answers null for a row that does not exist", async () => {
    const row = await withRepairTransaction(client, "read-write", (store) =>
      store.readRow({ table: "repair_parent", keyColumn: "id", keyValue: "nope" }, true),
    );
    expect(row).toBeNull();
  });

  it("inserts a row so that reading it back gives the same JSON", async () => {
    const copy = await withRepairTransaction(client, "read-write", async (store) => {
      const original = (await store.readRow(
        { table: "repair_parent", keyColumn: "id", keyValue: "p1" },
        true,
      )) as RowValues;
      const reference = { table: "repair_parent", keyColumn: "id", keyValue: "p3" };
      await store.insertRow(reference, { ...original, id: "p3" });
      return { original, inserted: await store.readRow(reference, true) };
    });
    expect(copy.inserted).toEqual({ ...copy.original, id: "p3" });
  });

  it("updates only the named columns", async () => {
    await withRepairTransaction(client, "read-write", (store) =>
      store.updateColumns({ table: "repair_parent", keyColumn: "id", keyValue: "p1" }, { name: "Renamed", seen: null }),
    );
    const { rows } = await client.query("SELECT name, seen, tags, score FROM repair_parent WHERE id = 'p1'");
    expect(rows[0]).toEqual({ name: "Renamed", seen: null, tags: ["a", "b"], score: 0.7090909 });
  });

  it("deletes a row that nothing depends on", async () => {
    await withRepairTransaction(client, "read-write", (store) =>
      store.deleteRow({ table: "repair_parent", keyColumn: "id", keyValue: "p2" }),
    );
    const { rowCount } = await client.query("SELECT 1 FROM repair_parent WHERE id = 'p2'");
    expect(rowCount).toBe(0);
  });

  it.each([
    { table: "repair_cascading", description: "a cascade would remove" },
    { table: "repair_nullable", description: "a set-null would change" },
  ])("refuses to delete a row whose child rows $description without the manifest naming them", async ({ table }) => {
    await client.query(`INSERT INTO ${table} VALUES ('c1', 'p1')`);
    const code = await rejectionOf(
      withRepairTransaction(client, "read-write", (store) =>
        store.deleteRow({ table: "repair_parent", keyColumn: "id", keyValue: "p1" }),
      ),
    );
    expect(code).toBe("REPAIR_UNLISTED_SIDE_EFFECT");
    expect((await client.query("SELECT 1 FROM repair_parent WHERE id = 'p1'")).rowCount).toBe(1);
    expect((await client.query(`SELECT parent_id FROM ${table}`)).rows[0].parent_id).toBe("p1");
  });

  it("deletes the parent once the manifest has removed its children first", async () => {
    await client.query("INSERT INTO repair_cascading VALUES ('c1', 'p1')");
    await withRepairTransaction(client, "read-write", async (store) => {
      await store.deleteRow({ table: "repair_cascading", keyColumn: "id", keyValue: "c1" });
      await store.deleteRow({ table: "repair_parent", keyColumn: "id", keyValue: "p1" });
    });
    expect((await client.query("SELECT 1 FROM repair_parent WHERE id = 'p1'")).rowCount).toBe(0);
  });

  it("lets PostgreSQL refuse a delete that a plain foreign key restricts", async () => {
    await client.query("INSERT INTO repair_restricted VALUES ('r1', 'p1')");
    const message = await rejectionOf(
      withRepairTransaction(client, "read-write", (store) =>
        store.deleteRow({ table: "repair_parent", keyColumn: "id", keyValue: "p1" }),
      ),
    );
    expect(message).toMatch(/foreign key|violates/i);
  });

  it("refuses names that do not exist or are not plain identifiers", async () => {
    const run = (work: (store: PostgresRowStore) => Promise<unknown>) =>
      rejectionOf(withRepairTransaction(client, "read-only", (store) => work(store as PostgresRowStore)));
    expect(
      await run((store) => store.readRow({ table: "repair_missing", keyColumn: "id", keyValue: "x" }, false)),
    ).toBe("REPAIR_UNKNOWN_TABLE");
    expect(
      await run((store) => store.readRow({ table: "repair_parent", keyColumn: "missing", keyValue: "x" }, false)),
    ).toBe("REPAIR_UNKNOWN_COLUMN");
    expect(
      await run((store) => store.readRow({ table: 'repair_parent"; --', keyColumn: "id", keyValue: "x" }, false)),
    ).toBe("REPAIR_IDENTIFIER_INVALID");
  });

  it("opens a read-only transaction to verify and a read-write one to apply, in UTC", async () => {
    // PostgreSQL itself allows writes to temporary tables in a read-only transaction, so the mode is read back.
    const settingsOf = (mode: "read-only" | "read-write") =>
      withRepairTransaction(client, mode, async () => {
        const { rows } = await client.query(
          "SELECT current_setting('transaction_read_only') AS read_only, current_setting('TimeZone') AS zone",
        );
        return rows[0];
      });
    expect(await settingsOf("read-only")).toEqual({ read_only: "on", zone: "UTC" });
    expect(await settingsOf("read-write")).toEqual({ read_only: "off", zone: "UTC" });
  });

  it("rolls everything back when the work fails", async () => {
    await rejectionOf(
      withRepairTransaction(client, "read-write", async (store) => {
        await store.updateColumns({ table: "repair_parent", keyColumn: "id", keyValue: "p1" }, { name: "Lost" });
        throw new Error("stop");
      }),
    );
    expect((await client.query("SELECT name FROM repair_parent WHERE id = 'p1'")).rows[0].name).toBe("First");
  });

  describe("a whole manifest through the engine", () => {
    it("applies, is a no-op the second time, and is undone by its inverse", async () => {
      const migrationHash = await readNewestMigrationHash(client);
      await client.query("INSERT INTO repair_cascading VALUES ('c1', 'p1')");
      const original = (await client.query("SELECT * FROM repair_parent ORDER BY id")).rows;
      const child = (await withRepairTransaction(client, "read-only", (store) =>
        store.readRow({ table: "repair_cascading", keyColumn: "id", keyValue: "c1" }, false),
      )) as RowValues;
      const manifest = {
        ...manifestOf([
          {
            kind: "update-columns",
            table: "repair_parent",
            keyColumn: "id",
            keyValue: "p1",
            before: { name: "First", seen: "2026-10-20T16:42:47.123+00:00" },
            after: { name: "Renamed", seen: null },
          },
          { kind: "delete-row", table: "repair_cascading", keyColumn: "id", keyValue: "c1", row: child },
          {
            kind: "insert-row",
            table: "repair_cascading",
            keyColumn: "id",
            keyValue: "c2",
            row: { id: "c2", parent_id: "p2" },
          },
        ]),
        requiredMigrationHash: migrationHash,
      };

      const verified = await withRepairTransaction(client, "read-only", (store, hash) =>
        verifyManifest(store, manifest, hash),
      );
      expect(verified).toMatchObject({ before: 3, after: 0, conflict: 0 });

      const applied = await withRepairTransaction(client, "read-write", (store, hash) =>
        applyManifest(store, manifest, hash),
      );
      expect(applied).toMatchObject({ written: 3, skipped: 0 });
      expect((await client.query("SELECT name, seen FROM repair_parent WHERE id = 'p1'")).rows[0]).toEqual({
        name: "Renamed",
        seen: null,
      });
      expect((await client.query("SELECT id FROM repair_cascading ORDER BY id")).rows).toEqual([{ id: "c2" }]);

      const again = await withRepairTransaction(client, "read-write", (store, hash) =>
        applyManifest(store, manifest, hash),
      );
      expect(again).toMatchObject({ written: 0, skipped: 3 });

      await withRepairTransaction(client, "read-write", (store, hash) =>
        applyManifest(store, invertManifest(manifest), hash),
      );
      expect((await client.query("SELECT * FROM repair_parent ORDER BY id")).rows).toEqual(original);
      expect((await client.query("SELECT id, parent_id FROM repair_cascading ORDER BY id")).rows).toEqual([
        { id: "c1", parent_id: "p1" },
      ]);
    });
  });
});
