export type DatabasePrivilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export interface DatabasePrivilegeExpectation {
  table: string;
  privilege: DatabasePrivilege;
}

export interface DatabaseSequencePrivilegeExpectation {
  sequence: string;
  privilege: "USAGE";
}

export interface DatabaseReadinessExpectations {
  expectedMigrationHashes: string[];
  expectedOwner?: string;
  privileges: DatabasePrivilegeExpectation[];
  sequencePrivileges?: DatabaseSequencePrivilegeExpectation[];
}

export interface DatabaseReadinessReport {
  insufficientPrivileges: DatabasePrivilegeExpectation[];
  insufficientSequencePrivileges: DatabaseSequencePrivilegeExpectation[];
  missingMigrationHashes: string[];
  missingSequences: string[];
  missingTables: string[];
  ok: boolean;
  ownerMismatches: Array<{ actualOwner: string; expectedOwner: string; table: string }>;
}

export interface ReadinessQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface PrivilegeRow {
  allowed: boolean;
  owner: string | null;
  privilege: DatabasePrivilege;
  table_exists: boolean;
  table_name: string;
}

interface SequencePrivilegeRow {
  allowed: boolean;
  sequence_exists: boolean;
  sequence_name: string;
}

export const MUSICCLOUD_READINESS_TABLES = [
  "tracks",
  "albums",
  "artist_profiles",
  "short_urls",
  "album_short_urls",
  "artist_short_urls",
  "service_links",
  "track_previews",
  "album_previews",
  "track_external_ids",
  "album_external_ids",
  "artist_external_ids",
  "artist_images",
  "album_vinyl_layouts",
  "album_vinyl_layout_identities",
  "nav_items",
  "nav_item_translations",
  "navigation_item_placements",
] as const;

const VINYL_WRITE_TABLES = ["album_vinyl_layouts", "album_vinyl_layout_identities"] as const;
const NAVIGATION_WRITE_TABLES = ["nav_items", "nav_item_translations", "navigation_item_placements"] as const;
const RUNTIME_WRITE_TABLES = [...VINYL_WRITE_TABLES, ...NAVIGATION_WRITE_TABLES] as const;

export function buildMusiccloudReadinessExpectations(
  latestMigrationHash: string,
  expectedOwner: string | undefined,
): DatabaseReadinessExpectations {
  return {
    expectedMigrationHashes: [latestMigrationHash],
    expectedOwner,
    privileges: [
      ...MUSICCLOUD_READINESS_TABLES.map((table) => ({ privilege: "SELECT" as const, table })),
      ...RUNTIME_WRITE_TABLES.flatMap((table) =>
        (["INSERT", "UPDATE", "DELETE"] as const).map((privilege) => ({ privilege, table })),
      ),
    ],
    sequencePrivileges: [{ sequence: "nav_items_id_seq", privilege: "USAGE" }],
  };
}

export async function inspectDatabaseReadiness(
  client: ReadinessQueryable,
  expectations: DatabaseReadinessExpectations,
): Promise<DatabaseReadinessReport> {
  const tables = expectations.privileges.map((item) => item.table);
  const privileges = expectations.privileges.map((item) => item.privilege);
  const privilegeResult = await client.query(
    `
      WITH expected(table_name, privilege) AS (
        SELECT * FROM unnest($1::text[], $2::text[])
      )
      SELECT expected.table_name,
             expected.privilege,
             target.oid IS NOT NULL AS table_exists,
             owner_role.rolname AS owner,
             CASE
               WHEN target.oid IS NULL THEN false
               ELSE has_table_privilege(current_user, target.oid, expected.privilege)
             END AS allowed
      FROM expected
      LEFT JOIN pg_namespace namespace ON namespace.nspname = 'public'
      LEFT JOIN pg_class target
        ON target.relnamespace = namespace.oid
       AND target.relname = expected.table_name
       AND target.relkind IN ('r', 'p')
      LEFT JOIN pg_roles owner_role ON owner_role.oid = target.relowner
      ORDER BY expected.table_name, expected.privilege
    `,
    [tables, privileges],
  );
  const rows = privilegeResult.rows as unknown as PrivilegeRow[];

  const missingTables = [...new Set(rows.filter((row) => !row.table_exists).map((row) => row.table_name))];
  const insufficientPrivileges = rows
    .filter((row) => row.table_exists && !row.allowed)
    .map((row) => ({ privilege: row.privilege, table: row.table_name }));

  const sequenceExpectations = expectations.sequencePrivileges ?? [];
  let missingSequences: string[] = [];
  let insufficientSequencePrivileges: DatabaseSequencePrivilegeExpectation[] = [];
  if (sequenceExpectations.length > 0) {
    const sequenceResult = await client.query(
      `
        WITH expected(sequence_name, privilege) AS (
          SELECT * FROM unnest($1::text[], $2::text[])
        )
        SELECT expected.sequence_name,
               target.oid IS NOT NULL AS sequence_exists,
               CASE
                 WHEN target.oid IS NULL THEN false
                 ELSE has_sequence_privilege(current_user, target.oid, expected.privilege)
               END AS allowed
        FROM expected
        LEFT JOIN pg_namespace namespace ON namespace.nspname = 'public'
        LEFT JOIN pg_class target
          ON target.relnamespace = namespace.oid
         AND target.relname = expected.sequence_name
         AND target.relkind = 'S'
        ORDER BY expected.sequence_name, expected.privilege
      `,
      [sequenceExpectations.map((item) => item.sequence), sequenceExpectations.map((item) => item.privilege)],
    );
    const sequenceRows = sequenceResult.rows as unknown as SequencePrivilegeRow[];
    missingSequences = [...new Set(sequenceRows.filter((row) => !row.sequence_exists).map((row) => row.sequence_name))];
    insufficientSequencePrivileges = sequenceRows
      .filter((row) => row.sequence_exists && !row.allowed)
      .map((row) => ({ privilege: "USAGE", sequence: row.sequence_name }));
  }

  const ownerMismatches: DatabaseReadinessReport["ownerMismatches"] = [];
  if (expectations.expectedOwner) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.table_exists || !row.owner || seen.has(row.table_name)) continue;
      seen.add(row.table_name);
      if (row.owner !== expectations.expectedOwner) {
        ownerMismatches.push({
          actualOwner: row.owner,
          expectedOwner: expectations.expectedOwner,
          table: row.table_name,
        });
      }
    }
  }

  let missingMigrationHashes: string[] = [];
  if (expectations.expectedMigrationHashes.length > 0) {
    const migrationResult = await client.query(
      `SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ANY($1::text[])`,
      [expectations.expectedMigrationHashes],
    );
    const present = new Set(migrationResult.rows.map((row) => String(row.hash)));
    missingMigrationHashes = expectations.expectedMigrationHashes.filter((hash) => !present.has(hash));
  }

  return {
    insufficientPrivileges,
    insufficientSequencePrivileges,
    missingMigrationHashes,
    missingSequences,
    missingTables,
    ok:
      missingTables.length === 0 &&
      missingSequences.length === 0 &&
      insufficientPrivileges.length === 0 &&
      insufficientSequencePrivileges.length === 0 &&
      ownerMismatches.length === 0 &&
      missingMigrationHashes.length === 0,
    ownerMismatches,
  };
}

export async function inspectMusiccloudDatabase(
  client: ReadinessQueryable,
  migrationsFolder: string,
  expectedOwner: string | undefined,
): Promise<DatabaseReadinessReport> {
  const latestMigrationHash = await readLatestDrizzleMigrationHash(migrationsFolder);
  return inspectDatabaseReadiness(client, buildMusiccloudReadinessExpectations(latestMigrationHash, expectedOwner));
}

export function assertDatabaseReady(report: DatabaseReadinessReport): void {
  if (report.ok) return;

  const reasons = [
    ...report.missingTables.map((table) => `missing table ${table}`),
    ...report.missingSequences.map((sequence) => `missing sequence ${sequence}`),
    ...report.insufficientPrivileges.map((item) => `missing ${item.privilege} privilege on ${item.table}`),
    ...report.insufficientSequencePrivileges.map((item) => `missing ${item.privilege} privilege on ${item.sequence}`),
    ...report.ownerMismatches.map(
      (item) => `owner mismatch on ${item.table}: expected ${item.expectedOwner}, got ${item.actualOwner}`,
    ),
    ...report.missingMigrationHashes.map((hash) => `migration hash ${hash} is missing`),
  ];
  throw new Error(`Database readiness failed: ${reasons.join("; ")}`);
}

export async function readLatestDrizzleMigrationHash(migrationsFolder: string): Promise<string> {
  const journalRaw = await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8");
  const journal = JSON.parse(journalRaw) as { entries?: Array<{ idx?: number; tag?: string }> };
  const latest = (journal.entries ?? [])
    .filter(
      (entry): entry is { idx: number; tag: string } => Number.isInteger(entry.idx) && typeof entry.tag === "string",
    )
    .sort((left, right) => right.idx - left.idx)[0];
  if (!latest) throw new Error("Drizzle migration journal has no valid entries.");

  const sql = await readFile(join(migrationsFolder, `${latest.tag}.sql`));
  return createHash("sha256").update(sql).digest("hex");
}

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
