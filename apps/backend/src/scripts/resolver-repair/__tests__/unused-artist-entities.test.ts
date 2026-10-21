import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json.js";
import { applyManifest } from "../engine.js";
import { invertManifest, type RowValues, sealManifest } from "../manifest.js";
import { type EntityEvidence, planUnusedArtistEntities } from "../planners/unused-artist-entities.js";
import { type PlanContext, PlanFailure } from "../planning.js";
import { REPAIRABLE_TABLES } from "../repairable-tables.js";
import { ARCHIVE_HASH, MemoryRowStore, MIGRATION_HASH } from "./memory-row-store.js";

type Data = Record<string, RowValues[]>;

const CREATED = "2026-08-09T10:00:00.100+00:00";

const entity = (id: string, overrides: RowValues = {}): RowValues => ({
  id,
  entity_type: "unknown",
  verification_status: "candidate",
  confidence: null,
  created_at: CREATED,
  updated_at: CREATED,
  ...overrides,
});
const name = (entityId: string, text: string, overrides: RowValues = {}): RowValues => ({
  id: `${entityId}-name`,
  artist_entity_id: entityId,
  locale: null,
  name: text,
  name_type: "canonical",
  source_id: null,
  created_at: CREATED,
  ...overrides,
});

/** The columns that reference `artist_entities`, as the catalog reports them. */
const REFERENCES = [
  { table_name: "album_artist_credits", column_name: "artist_entity_id", width: 1 },
  { table_name: "artist_entity_names", column_name: "artist_entity_id", width: 1 },
  { table_name: "artist_group_memberships", column_name: "group_artist_entity_id", width: 1 },
  { table_name: "artist_group_memberships", column_name: "member_artist_entity_id", width: 1 },
  { table_name: "track_artist_credits", column_name: "artist_entity_id", width: 1 },
];

/** A catalog of one artist credited on a track, and the duplicate entity the same artist left behind. */
function artistWithDuplicate(): Data {
  return {
    artist_entities: [entity("used"), entity("duplicate")],
    artist_entity_names: [name("used", "Avantasia"), name("duplicate", "Avantasia")],
    track_artist_credits: [{ id: "credit-1", track_id: "track-1", artist_entity_id: "used" }],
    album_artist_credits: [],
    artist_group_memberships: [],
  };
}

/** A context over fixed rows. The planner asks the catalog first, then each referencing column, then the two tables. */
function contextOver(data: Data, references: RowValues[] = REFERENCES): PlanContext {
  return {
    migrationHash: MIGRATION_HASH,
    sourceArchiveSha256: ARCHIVE_HASH,
    ports: {
      fetchTrack: async () => {
        throw new Error("the entity repair asks no provider");
      },
    },
    async query(sql) {
      if (sql.includes("pg_constraint")) return references;
      const distinct = /SELECT DISTINCT "(\w+)" AS entity FROM "(\w+)"/.exec(sql);
      if (distinct)
        return (data[distinct[2]] ?? [])
          .filter((row) => row[distinct[1]] != null)
          .map((row) => ({ entity: row[distinct[1]] as string }));
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
      return data[table] ?? [];
    },
  };
}

function storeFor(data: Data): MemoryRowStore {
  return new MemoryRowStore(
    ["artist_entities", "artist_entity_names"].flatMap((table) =>
      (data[table] ?? []).map((row) => ({ table, keyColumn: "id", row })),
    ),
  );
}

async function plan(data: Data, references?: RowValues[]) {
  return planUnusedArtistEntities(contextOver(data, references), {});
}

function entitiesOf(result: Awaited<ReturnType<typeof plan>>): EntityEvidence[] {
  return (result.evidence as unknown as { entities: EntityEvidence[] }).entities;
}

describe("removing an entity that duplicates one in use", () => {
  it("deletes the name rows first and then the entity, and leaves the entity in use alone", async () => {
    const data = artistWithDuplicate();
    const result = await plan(data);
    expect(
      result.manifest.operations.map((operation) => `${operation.kind} ${operation.table}/${operation.keyValue}`),
    ).toEqual(["delete-row artist_entity_names/duplicate-name", "delete-row artist_entities/duplicate"]);
    expect(entitiesOf(result)).toEqual([{ entity: "duplicate", result: "removed", nameRows: 1 }]);
    const store = storeFor(data);
    await applyManifest(store, result.manifest, MIGRATION_HASH);
    expect(Object.keys(store.snapshot())).toEqual(["artist_entities/used", "artist_entity_names/used-name"]);
  });

  it("matches names regardless of case, as the name lookup does", async () => {
    const data = artistWithDuplicate();
    data.artist_entity_names = [name("used", "Avantasia"), name("duplicate", "AVANTASIA")];
    expect(entitiesOf(await plan(data))[0].result).toBe("removed");
  });

  it("is undone completely by the inverse manifest", async () => {
    const data = artistWithDuplicate();
    const { manifest } = await plan(data);
    const store = storeFor(data);
    const original = store.snapshot();
    await applyManifest(store, manifest, MIGRATION_HASH);
    expect(store.snapshot()).not.toEqual(original);
    await applyManifest(store, invertManifest(manifest), MIGRATION_HASH);
    expect(store.snapshot()).toEqual(original);
  });

  it("produces a manifest the runner accepts, and the same text every time", async () => {
    const first = await plan(artistWithDuplicate());
    const second = await plan(artistWithDuplicate());
    expect(() => sealManifest(first.manifest, REPAIRABLE_TABLES)).not.toThrow();
    expect(canonicalJson(first.manifest)).toBe(canonicalJson(second.manifest));
  });
});

describe("leaving an entity as it is", () => {
  it.each([
    {
      name: "an entity a track credit references",
      change: (data: Data) => data.track_artist_credits.push({ id: "credit-2", artist_entity_id: "duplicate" }),
    },
    {
      name: "an entity an album credit references",
      change: (data: Data) => data.album_artist_credits.push({ id: "credit-2", artist_entity_id: "duplicate" }),
    },
    {
      name: "an entity referenced as the group of a membership",
      change: (data: Data) =>
        data.artist_group_memberships.push({
          id: "m",
          group_artist_entity_id: "duplicate",
          member_artist_entity_id: "used",
        }),
    },
    {
      name: "an entity referenced as the member of a membership",
      change: (data: Data) =>
        data.artist_group_memberships.push({
          id: "m",
          group_artist_entity_id: "used",
          member_artist_entity_id: "duplicate",
        }),
    },
  ])("$name", async ({ change }) => {
    const data = artistWithDuplicate();
    change(data);
    const result = await plan(data);
    expect(result.manifest.operations).toEqual([]);
    expect(entitiesOf(result)).toEqual([]);
  });

  it.each([
    {
      name: "a verified entity",
      change: (data: Data) => (data.artist_entities[1] = entity("duplicate", { verification_status: "verified" })),
      reason: "curated",
    },
    {
      name: "an entity of a known type",
      change: (data: Data) => (data.artist_entities[1] = entity("duplicate", { entity_type: "group" })),
      reason: "curated",
    },
    {
      name: "an entity with a name someone added",
      change: (data: Data) =>
        data.artist_entity_names.push(
          name("duplicate", "Tobias Sammet", { id: "duplicate-alias", name_type: "alias" }),
        ),
      reason: "curated",
    },
    {
      name: "an entity without a name",
      change: (data: Data) => (data.artist_entity_names = [name("used", "Avantasia")]),
      reason: "unnamed",
    },
    {
      name: "an entity whose name no entity in use holds",
      change: (data: Data) => (data.artist_entity_names = [name("used", "Avantasia"), name("duplicate", "Edguy")]),
      reason: "name-not-held-by-a-used-entity",
    },
    {
      name: "an entity with a second name that no entity in use holds",
      change: (data: Data) => data.artist_entity_names.push(name("duplicate", "Edguy", { id: "duplicate-second" })),
      reason: "name-not-held-by-a-used-entity",
    },
  ])("$name", async ({ change, reason }) => {
    const data = artistWithDuplicate();
    change(data);
    const result = await plan(data);
    expect(result.manifest.operations).toEqual([]);
    expect(entitiesOf(result)).toEqual([expect.objectContaining({ entity: "duplicate", result: reason })]);
  });

  it("keeps both of two unused entities that share a name when no entity in use holds it", async () => {
    const data = artistWithDuplicate();
    data.track_artist_credits = [];
    const result = await plan(data);
    expect(result.manifest.operations).toEqual([]);
    expect(entitiesOf(result).map((item) => item.result)).toEqual([
      "name-not-held-by-a-used-entity",
      "name-not-held-by-a-used-entity",
    ]);
  });
});

describe("refusing a schema it cannot count", () => {
  it("refuses a foreign key over several columns", async () => {
    const references = [...REFERENCES, { table_name: "artist_pairs", column_name: "artist_entity_id", width: 2 }];
    await expect(plan(artistWithDuplicate(), references)).rejects.toMatchObject({ code: "PLAN_REFERENCE_UNSUPPORTED" });
  });

  it("refuses a table name that is not a plain identifier", async () => {
    const references = [...REFERENCES, { table_name: 'other."odd"', column_name: "artist_entity_id", width: 1 }];
    const rejected = plan(artistWithDuplicate(), references);
    await expect(rejected).rejects.toBeInstanceOf(PlanFailure);
    await expect(rejected).rejects.toMatchObject({ code: "PLAN_REFERENCE_UNSUPPORTED" });
  });
});
