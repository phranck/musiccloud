import type { JsonValue } from "../canonical-json.js";
import { IDENTIFIER_PATTERN, type RepairOperation, type RowValues } from "../manifest.js";
import { deletion, groupBy, textOf } from "../planner-rows.js";
import { type PlanContext, PlanFailure, type Planner } from "../planning.js";

/** The name this repair carries in its manifest. */
export const UNUSED_ARTIST_ENTITIES_REPAIR = "unused-artist-entities";

/** The issue that owns this repair. */
const UNUSED_ARTIST_ENTITIES_ISSUE = 785;

/** Rows of this table describe an entity and go with it, so they are not a use of it. */
const NAME_TABLE = "artist_entity_names";

/**
 * A new entity starts as an unknown candidate, and its name rows are canonical. An entity that differs in any of
 * these was set by a person or by an identity check, so the repair leaves it alone.
 */
const UNCURATED_ENTITY_TYPE = "unknown";
const UNCURATED_VERIFICATION_STATUS = "candidate";
const UNCURATED_NAME_TYPE = "canonical";

/** The foreign keys that point at `artist_entities`, one row per constrained column. */
const REFERENCING_COLUMNS_SQL = `SELECT constraint_info.conrelid::regclass::text AS table_name,
       child_attribute.attname AS column_name, array_length(constraint_info.conkey, 1) AS width
  FROM pg_constraint AS constraint_info
  JOIN pg_attribute AS child_attribute
    ON child_attribute.attrelid = constraint_info.conrelid AND child_attribute.attnum = constraint_info.conkey[1]
 WHERE constraint_info.contype = 'f' AND constraint_info.confrelid = to_regclass('artist_entities')
 ORDER BY 1, 2`;

/** Why an unused entity stays. A fixed code, never a value from the data. */
export type KeptReason = "curated" | "unnamed" | "name-not-held-by-a-used-entity";

/** The outcome for one entity that nothing references, for the reviewer. */
export interface EntityEvidence {
  entity: string;
  result: "removed" | KeptReason;
  nameRows: number;
}

interface ReferencingColumn {
  table: string;
  column: string;
}

/**
 * Lists the columns of other tables that reference an artist entity, read from the catalog so a table added later
 * counts as a use without this file changing.
 *
 * Both identifiers go into SQL text below, so they must be plain lowercase names. A key over several columns cannot be
 * counted by the entity id alone, and the planner refuses it instead of guessing.
 *
 * @param query - The planner's read access to the restored copy.
 * @returns The referencing columns, in catalog order.
 * @throws {PlanFailure} With `PLAN_REFERENCE_UNSUPPORTED` for a composite key or an identifier that is not plain.
 */
async function referencingColumns(query: PlanContext["query"]): Promise<ReferencingColumn[]> {
  const rows = await query(REFERENCING_COLUMNS_SQL);
  return rows.map((row) => {
    const table = textOf(row, "table_name");
    const column = textOf(row, "column_name");
    if (row.width !== 1 || !IDENTIFIER_PATTERN.test(table) || !IDENTIFIER_PATTERN.test(column))
      throw new PlanFailure("PLAN_REFERENCE_UNSUPPORTED");
    return { table, column };
  });
}

/**
 * Collects the ids of the entities that any row outside their own name rows still references.
 *
 * @param query - The planner's read access to the restored copy.
 * @param columns - The referencing columns, whose names {@link referencingColumns} has checked.
 * @returns The ids of the entities in use.
 */
async function usedEntityIds(query: PlanContext["query"], columns: readonly ReferencingColumn[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (const { table, column } of columns) {
    if (table === NAME_TABLE) continue;
    const rows = await query(`SELECT DISTINCT "${column}" AS entity FROM "${table}" WHERE "${column}" IS NOT NULL`);
    for (const row of rows) used.add(textOf(row, "entity"));
  }
  return used;
}

/** The name as the lookup compares it, which is the name in lower case. */
function lookupKey(name: RowValues): string {
  return textOf(name, "name").toLowerCase();
}

/**
 * Decides whether an entity that nothing references can go.
 *
 * It goes when it is an uncurated candidate whose every name is also held by an entity that is in use, because then the
 * artist stays findable under each of its names and the removal only ends the ambiguity of two entities for one name.
 *
 * @param entity - The `artist_entities` row.
 * @param names - Its `artist_entity_names` rows.
 * @param namesOfUsedEntities - Every name, in lookup form, that an entity in use holds.
 * @returns `removed`, or the reason the entity stays.
 */
function judge(
  entity: RowValues,
  names: readonly RowValues[],
  namesOfUsedEntities: ReadonlySet<string>,
): EntityEvidence["result"] {
  if (
    entity.entity_type !== UNCURATED_ENTITY_TYPE ||
    entity.verification_status !== UNCURATED_VERIFICATION_STATUS ||
    names.some((name) => name.name_type !== UNCURATED_NAME_TYPE)
  )
    return "curated";
  if (names.length === 0) return "unnamed";
  if (!names.every((name) => namesOfUsedEntities.has(lookupKey(name)))) return "name-not-held-by-a-used-entity";
  return "removed";
}

/**
 * Plans the removal of artist entities that no row references and whose names an entity in use also holds.
 *
 * Each such entity goes into the manifest as `delete-row` operations: its name rows first, because they would
 * otherwise disappear with the entity unlisted, and then the entity. An entity that is curated, has no name, or holds a
 * name that no entity in use holds stays and is listed with its reason.
 *
 * @param context - Rows of the restored copy.
 * @returns The manifest, and one entry per unused entity as evidence.
 * @throws {PlanFailure} With `PLAN_REFERENCE_UNSUPPORTED` when a key over the entities cannot be counted by id.
 */
export const planUnusedArtistEntities: Planner = async (context) => {
  const columns = await referencingColumns(context.query);
  const used = await usedEntityIds(context.query, columns);
  const entities = await context.query('SELECT * FROM artist_entities ORDER BY id COLLATE "C"');
  const names = groupBy(await context.query(`SELECT * FROM ${NAME_TABLE} ORDER BY id COLLATE "C"`), "artist_entity_id");

  const namesOfUsedEntities = new Set<string>();
  for (const entity of entities)
    if (used.has(textOf(entity, "id")))
      for (const name of names.get(textOf(entity, "id")) ?? []) namesOfUsedEntities.add(lookupKey(name));

  const operations: RepairOperation[] = [];
  const unused: EntityEvidence[] = [];
  for (const entity of entities) {
    const id = textOf(entity, "id");
    if (used.has(id)) continue;
    const ownNames = names.get(id) ?? [];
    const result = judge(entity, ownNames, namesOfUsedEntities);
    unused.push({ entity: id, result, nameRows: ownNames.length });
    if (result !== "removed") continue;
    for (const name of ownNames) operations.push(deletion(NAME_TABLE, name));
    operations.push(deletion("artist_entities", entity));
  }

  const evidence: JsonValue = {
    used: used.size,
    unused: unused.length,
    removed: unused.filter((item) => item.result === "removed").length,
    entities: unused as unknown as JsonValue,
    operations: operations.length,
  };
  return {
    manifest: {
      formatVersion: 1,
      repair: UNUSED_ARTIST_ENTITIES_REPAIR,
      issue: UNUSED_ARTIST_ENTITIES_ISSUE,
      sourceArchiveSha256: context.sourceArchiveSha256,
      requiredMigrationHash: context.migrationHash,
      operations,
    },
    evidence,
  };
};
