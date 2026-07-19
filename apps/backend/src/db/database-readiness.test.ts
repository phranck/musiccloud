import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  assertDatabaseReady,
  buildMusiccloudReadinessExpectations,
  inspectDatabaseReadiness,
  readLatestDrizzleMigrationHash,
} from "./database-readiness.js";

const expectations = {
  expectedMigrationHashes: ["latest-hash"],
  expectedOwner: "db",
  privileges: [
    { table: "albums", privilege: "SELECT" as const },
    { table: "album_vinyl_layouts", privilege: "SELECT" as const },
    { table: "album_vinyl_layouts", privilege: "INSERT" as const },
  ],
};

describe("inspectDatabaseReadiness", () => {
  it("reports ready only when tables, privileges, owners, and migrations match", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { allowed: true, owner: "db", privilege: "SELECT", table_exists: true, table_name: "albums" },
          {
            allowed: true,
            owner: "db",
            privilege: "SELECT",
            table_exists: true,
            table_name: "album_vinyl_layouts",
          },
          {
            allowed: true,
            owner: "db",
            privilege: "INSERT",
            table_exists: true,
            table_name: "album_vinyl_layouts",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ hash: "latest-hash" }] });

    await expect(inspectDatabaseReadiness({ query }, expectations)).resolves.toEqual({
      insufficientPrivileges: [],
      insufficientSequencePrivileges: [],
      missingMigrationHashes: [],
      missingSequences: [],
      missingTables: [],
      ok: true,
      ownerMismatches: [],
    });
  });

  it("distinguishes missing tables, missing privileges, owner drift, and migration drift", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { allowed: true, owner: "postgres", privilege: "SELECT", table_exists: true, table_name: "albums" },
          {
            allowed: false,
            owner: null,
            privilege: "SELECT",
            table_exists: false,
            table_name: "album_vinyl_layouts",
          },
          {
            allowed: false,
            owner: null,
            privilege: "INSERT",
            table_exists: false,
            table_name: "album_vinyl_layouts",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const report = await inspectDatabaseReadiness({ query }, expectations);

    expect(report).toEqual({
      insufficientPrivileges: [],
      insufficientSequencePrivileges: [],
      missingMigrationHashes: ["latest-hash"],
      missingSequences: [],
      missingTables: ["album_vinyl_layouts"],
      ok: false,
      ownerMismatches: [{ actualOwner: "postgres", expectedOwner: "db", table: "albums" }],
    });
    expect(() => assertDatabaseReady(report)).toThrow(/owner.*albums.*migration.*latest-hash/i);
  });

  it("reports an inaccessible existing table separately from a missing table", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { allowed: true, owner: "db", privilege: "SELECT", table_exists: true, table_name: "albums" },
          {
            allowed: false,
            owner: "db",
            privilege: "SELECT",
            table_exists: true,
            table_name: "album_vinyl_layouts",
          },
          {
            allowed: false,
            owner: "db",
            privilege: "INSERT",
            table_exists: true,
            table_name: "album_vinyl_layouts",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ hash: "latest-hash" }] });

    await expect(inspectDatabaseReadiness({ query }, expectations)).resolves.toMatchObject({
      insufficientPrivileges: [
        { privilege: "SELECT", table: "album_vinyl_layouts" },
        { privilege: "INSERT", table: "album_vinyl_layouts" },
      ],
      missingTables: [],
      ok: false,
    });
  });

  it("reports missing sequence USAGE separately from table privileges", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ allowed: true, owner: "db", privilege: "SELECT", table_exists: true, table_name: "albums" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            allowed: false,
            sequence_exists: true,
            sequence_name: "nav_items_id_seq",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ hash: "latest-hash" }] });

    await expect(
      inspectDatabaseReadiness(
        { query },
        {
          expectedMigrationHashes: ["latest-hash"],
          privileges: [{ table: "albums", privilege: "SELECT" }],
          sequencePrivileges: [{ sequence: "nav_items_id_seq", privilege: "USAGE" }],
        },
      ),
    ).resolves.toMatchObject({
      insufficientSequencePrivileges: [{ sequence: "nav_items_id_seq", privilege: "USAGE" }],
      missingSequences: [],
      ok: false,
    });
  });
});

describe("buildMusiccloudReadinessExpectations", () => {
  it("requires both vinyl tables and CRUD access for their runtime cache writes", () => {
    const result = buildMusiccloudReadinessExpectations("latest-hash", "db");

    expect(result.expectedMigrationHashes).toEqual(["latest-hash"]);
    expect(result.expectedOwner).toBe("db");
    for (const table of ["album_vinyl_layouts", "album_vinyl_layout_identities"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(result.privileges).toContainEqual({ table, privilege });
      }
    }
  });

  it("requires CRUD access for the complete navigation write model", () => {
    const result = buildMusiccloudReadinessExpectations("latest-hash", "db");

    for (const table of ["nav_items", "nav_item_translations", "navigation_item_placements"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(result.privileges).toContainEqual({ table, privilege });
      }
    }
    expect(result.sequencePrivileges).toContainEqual({ sequence: "nav_items_id_seq", privilege: "USAGE" });
  });

  it("requires CRUD access and serial sequence usage for the complete contextual editorial model", () => {
    const result = buildMusiccloudReadinessExpectations("latest-hash", "db");

    for (const table of [
      "content_pages",
      "content_page_publications",
      "page_segments",
      "content_page_translations",
      "page_segment_translations",
      "nav_items",
      "nav_item_translations",
      "navigation_item_placements",
    ]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(result.privileges).toContainEqual({ table, privilege });
      }
    }
    expect(result.sequencePrivileges).toEqual(
      expect.arrayContaining([
        { sequence: "nav_items_id_seq", privilege: "USAGE" },
        { sequence: "page_segments_id_seq", privilege: "USAGE" },
      ]),
    );
  });

  it("requires CRUD access for project ownership, registrations, audit, and usage", () => {
    const result = buildMusiccloudReadinessExpectations("latest-hash", "db");

    for (const table of [
      "developer_projects",
      "developer_project_subscriptions",
      "api_access_requests",
      "api_clients",
      "api_client_tokens",
      "api_access_audit_events",
      "api_usage_events",
    ]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(result.privileges).toContainEqual({ table, privilege });
      }
    }
  });

  it("requires CRUD access for artist profile cache refresh persistence", () => {
    const result = buildMusiccloudReadinessExpectations("latest-hash", "db");

    for (const table of ["artist_cache", "artist_profile_refresh_events"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        expect(result.privileges).toContainEqual({ table, privilege });
      }
    }
  });
});

describe("readLatestDrizzleMigrationHash", () => {
  it("hashes the SQL file referenced by the last Drizzle journal entry", async () => {
    const folder = await mkdtemp(join(tmpdir(), "musiccloud-migrations-"));
    try {
      await mkdir(join(folder, "meta"));
      await writeFile(
        join(folder, "meta", "_journal.json"),
        JSON.stringify({
          entries: [
            { idx: 0, tag: "0000_first" },
            { idx: 1, tag: "0001_latest" },
          ],
        }),
      );
      await writeFile(join(folder, "0000_first.sql"), "SELECT 1;");
      await writeFile(join(folder, "0001_latest.sql"), "SELECT 2;\n");

      await expect(readLatestDrizzleMigrationHash(folder)).resolves.toBe(
        createHash("sha256").update("SELECT 2;\n").digest("hex"),
      );
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  });
});
