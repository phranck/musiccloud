import { canonicalJson, type JsonValue } from "../canonical-json.js";
import type { RepairOperation, RowValues } from "../manifest.js";
import { PlanFailure, type Planner } from "../planning.js";

/** The name this repair carries in its manifest. */
export const DUPLICATE_IDENTITIES_REPAIR = "duplicate-identities";

/** The issue that owns this repair. */
const DUPLICATE_IDENTITIES_ISSUE = 769;

/** A kind of record that can exist twice, with the tables around it. */
interface RecordKind {
  table: "tracks" | "albums";
  /** The column in every child table that references the record. */
  foreignKey: "track_id" | "album_id";
  /** A repeated value in one of these columns puts two records into one candidate group. */
  groupColumns: readonly string[];
  /** Columns that must hold the same value in both records before they count as twins. */
  identityColumns: readonly string[];
  shortUrlTable: "short_urls" | "album_short_urls";
  aliasTable: "track_short_url_aliases" | "album_short_url_aliases";
  linkTable: "service_links" | "album_service_links";
  observationTable: "track_external_ids" | "album_external_ids";
  previewTable: "track_previews" | "album_previews";
  creditTable: "track_artist_credits" | "album_artist_credits";
  /** Only tracks keep recorded misses. */
  missTable?: "service_link_misses";
}

const TRACKS: RecordKind = {
  table: "tracks",
  foreignKey: "track_id",
  groupColumns: ["isrc", "source_url"],
  identityColumns: [
    "title",
    "album_name",
    "duration_ms",
    "source_service",
    "source_url",
    "isrc",
    "release_date",
    "is_explicit",
    "artwork_url",
  ],
  shortUrlTable: "short_urls",
  aliasTable: "track_short_url_aliases",
  linkTable: "service_links",
  observationTable: "track_external_ids",
  previewTable: "track_previews",
  creditTable: "track_artist_credits",
  missTable: "service_link_misses",
};

const ALBUMS: RecordKind = {
  table: "albums",
  foreignKey: "album_id",
  groupColumns: ["upc", "source_url"],
  identityColumns: [
    "title",
    "release_date",
    "total_tracks",
    "label",
    "upc",
    "source_service",
    "source_url",
    "artwork_url",
  ],
  shortUrlTable: "album_short_urls",
  aliasTable: "album_short_url_aliases",
  linkTable: "album_service_links",
  observationTable: "album_external_ids",
  previewTable: "album_previews",
  creditTable: "album_artist_credits",
};

/** A link found by an identifier names the same recording whichever catalog entry it points to. */
const IDENTIFIER_MATCH_METHOD = "isrc";

/** Why a group of candidates stays as it is. A fixed code, never a value from the data. */
export type UnresolvedReason =
  | "group-size"
  | "identity-differs"
  | "credits-differ"
  | "short-url-count"
  | "link-conflict"
  | "link-id-unexpected";

/** The outcome for one candidate group, for the reviewer. */
export interface GroupEvidence {
  kind: RecordKind["table"];
  ids: string[];
  result: "merged" | UnresolvedReason;
  /** The column or service the reason is about, when it names one. */
  detail?: string;
  winner?: string;
  loser?: string;
  operations?: number;
  /** Artist entities that only the removed record's credits referenced, which this repair does not merge. */
  unreferencedArtistEntities?: string[];
}

/** The rows around the records of one kind, grouped by the record they belong to. */
interface Children {
  shortUrls: Map<string, RowValues[]>;
  links: Map<string, RowValues[]>;
  observations: Map<string, RowValues[]>;
  previews: Map<string, RowValues[]>;
  credits: Map<string, RowValues[]>;
  misses: Map<string, RowValues[]>;
}

function textOf(row: RowValues, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new PlanFailure("PLAN_ROW_MISSING");
  return value;
}

/** Groups rows by the record they reference, in the order they arrive. */
function groupBy(rows: readonly RowValues[], foreignKey: string): Map<string, RowValues[]> {
  const grouped = new Map<string, RowValues[]>();
  for (const row of rows) {
    const owner = textOf(row, foreignKey);
    grouped.set(owner, [...(grouped.get(owner) ?? []), row]);
  }
  return grouped;
}

function deletion(table: string, row: RowValues): RepairOperation {
  return { kind: "delete-row", table, keyColumn: "id", keyValue: textOf(row, "id"), row };
}

function insertion(table: string, row: RowValues): RepairOperation {
  return { kind: "insert-row", table, keyColumn: "id", keyValue: textOf(row, "id"), row };
}

/** Moves a child row to another record by changing the column that references it. */
function reassignment(table: string, foreignKey: string, row: RowValues, targetId: string): RepairOperation {
  return {
    kind: "update-columns",
    table,
    keyColumn: "id",
    keyValue: textOf(row, "id"),
    before: { [foreignKey]: row[foreignKey] },
    after: { [foreignKey]: targetId },
  };
}

/** Chronological order, and the id as the tie breaker, so the same data always picks the same record to keep. */
function byAge(left: RowValues, right: RowValues): number {
  const difference = Date.parse(textOf(left, "created_at")) - Date.parse(textOf(right, "created_at"));
  if (difference !== 0) return difference;
  return textOf(left, "id") < textOf(right, "id") ? -1 : 1;
}

/** Joins records into candidate groups when they share a value in one of the group columns. */
function candidateGroups(kind: RecordKind, records: readonly RowValues[]): RowValues[][] {
  const parent = new Map(records.map((record) => [textOf(record, "id"), textOf(record, "id")]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) as string;
    return current;
  };
  const firstWithValue = new Map<string, string>();
  for (const record of records) {
    const id = textOf(record, "id");
    for (const column of kind.groupColumns) {
      const value = record[column];
      if (typeof value !== "string" || value.trim() === "") continue;
      const key = `${column}\u0000${value}`;
      const first = firstWithValue.get(key);
      if (first === undefined) firstWithValue.set(key, id);
      else parent.set(find(id), find(first));
    }
  }
  const groups = new Map<string, RowValues[]>();
  for (const record of records) {
    const root = find(textOf(record, "id"));
    groups.set(root, [...(groups.get(root) ?? []), record]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * The credit names, roles and positions of a record, which must agree between twins.
 * The rows are put in a fixed order first, because the database returns them by their random ids, and the same
 * credits of two twins arrive in different orders.
 */
function creditSignature(credits: readonly RowValues[] | undefined): string {
  return canonicalJson(
    (credits ?? [])
      .map((credit) => canonicalJson([credit.credit_position, credit.credit_role, credit.credit_name]))
      .sort(),
  );
}

/**
 * Plans the merge of two records into the older one.
 *
 * The older record stays. The younger one's short URL becomes an alias of the older one, links and identifier
 * observations and previews that only the younger one has move to the older one, and everything else that belongs
 * to the younger one goes with it. Anything that cannot be decided from the data alone leaves the pair unchanged.
 *
 * @returns The operations and notes, or the reason the pair stays.
 */
function mergeTwins(
  kind: RecordKind,
  winner: RowValues,
  loser: RowValues,
  children: Children,
):
  | { operations: RepairOperation[]; unreferencedArtistEntities: string[] }
  | { reason: UnresolvedReason; detail?: string } {
  const winnerId = textOf(winner, "id");
  const loserId = textOf(loser, "id");

  for (const column of kind.identityColumns)
    if (canonicalJson(winner[column] ?? null) !== canonicalJson(loser[column] ?? null))
      return { reason: "identity-differs", detail: column };
  if (creditSignature(children.credits.get(winnerId)) !== creditSignature(children.credits.get(loserId)))
    return { reason: "credits-differ" };

  const operations: RepairOperation[] = [];
  const loserShortUrls = children.shortUrls.get(loserId) ?? [];
  if (loserShortUrls.length > 1) return { reason: "short-url-count" };
  for (const shortUrl of loserShortUrls) {
    operations.push(deletion(kind.shortUrlTable, shortUrl));
    operations.push(
      insertion(kind.aliasTable, {
        id: shortUrl.id,
        [kind.foreignKey]: winnerId,
        created_at: shortUrl.created_at,
      }),
    );
  }

  const winnerLinks = new Map((children.links.get(winnerId) ?? []).map((link) => [textOf(link, "service"), link]));
  const linkInsertions: RepairOperation[] = [];
  const linkDeletions: RepairOperation[] = [];
  for (const link of children.links.get(loserId) ?? []) {
    const service = textOf(link, "service");
    const kept = winnerLinks.get(service);
    if (kept) {
      const sameDestination = kept.url === link.url;
      const bothByIdentifier =
        kept.match_method === IDENTIFIER_MATCH_METHOD && link.match_method === IDENTIFIER_MATCH_METHOD;
      if (!sameDestination && !bothByIdentifier) return { reason: "link-conflict", detail: service };
    } else {
      if (link.id !== `${loserId}-${service}`) return { reason: "link-id-unexpected", detail: service };
      linkInsertions.push(
        insertion(kind.linkTable, { ...link, id: `${winnerId}-${service}`, [kind.foreignKey]: winnerId }),
      );
    }
    linkDeletions.push(deletion(kind.linkTable, link));
  }
  operations.push(...linkInsertions, ...linkDeletions);

  const winnerObservations = new Set(
    (children.observations.get(winnerId) ?? []).map((row) =>
      canonicalJson([row.id_type, row.id_value, row.source_service]),
    ),
  );
  for (const observation of children.observations.get(loserId) ?? []) {
    const known = winnerObservations.has(
      canonicalJson([observation.id_type, observation.id_value, observation.source_service]),
    );
    operations.push(
      known
        ? deletion(kind.observationTable, observation)
        : reassignment(kind.observationTable, kind.foreignKey, observation, winnerId),
    );
  }

  const winnerPreviews = new Set((children.previews.get(winnerId) ?? []).map((row) => row.service));
  for (const preview of children.previews.get(loserId) ?? [])
    operations.push(
      winnerPreviews.has(preview.service)
        ? deletion(kind.previewTable, preview)
        : reassignment(kind.previewTable, kind.foreignKey, preview, winnerId),
    );

  if (kind.missTable)
    for (const miss of children.misses.get(loserId) ?? []) operations.push(deletion(kind.missTable, miss));

  const winnerEntities = new Set(
    (children.credits.get(winnerId) ?? []).map((credit) => textOf(credit, "artist_entity_id")),
  );
  const unreferencedArtistEntities: string[] = [];
  for (const credit of children.credits.get(loserId) ?? []) {
    operations.push(deletion(kind.creditTable, credit));
    const entity = textOf(credit, "artist_entity_id");
    if (!winnerEntities.has(entity)) unreferencedArtistEntities.push(entity);
  }

  operations.push(deletion(kind.table, loser));
  return { operations, unreferencedArtistEntities };
}

/** Reads the candidate records of one kind and the rows around them. */
async function loadKind(
  kind: RecordKind,
  query: (sql: string, parameters?: unknown[]) => Promise<RowValues[]>,
): Promise<{ records: RowValues[]; children: Children }> {
  const repeated = kind.groupColumns
    .map(
      (column) =>
        `(${column} IS NOT NULL AND btrim(${column}) <> '' AND ${column} IN (SELECT ${column} FROM ${kind.table} WHERE ${column} IS NOT NULL AND btrim(${column}) <> '' GROUP BY ${column} HAVING count(*) > 1))`,
    )
    .join(" OR ");
  const records = await query(`SELECT * FROM ${kind.table} WHERE ${repeated} ORDER BY id COLLATE "C"`);
  const ids = records.map((record) => textOf(record, "id"));
  const around = (table: string) =>
    query(`SELECT * FROM ${table} WHERE ${kind.foreignKey} = ANY($1::text[]) ORDER BY id COLLATE "C"`, [ids]);
  const [shortUrls, links, observations, previews, credits, misses] = await Promise.all([
    around(kind.shortUrlTable),
    around(kind.linkTable),
    around(kind.observationTable),
    around(kind.previewTable),
    around(kind.creditTable),
    kind.missTable ? around(kind.missTable) : Promise.resolve([]),
  ]);
  return {
    records,
    children: {
      shortUrls: groupBy(shortUrls, kind.foreignKey),
      links: groupBy(links, kind.foreignKey),
      observations: groupBy(observations, kind.foreignKey),
      previews: groupBy(previews, kind.foreignKey),
      credits: groupBy(credits, kind.foreignKey),
      misses: groupBy(misses, kind.foreignKey),
    },
  };
}

/**
 * Plans the merge of duplicate recordings and releases into the older record of each pair.
 *
 * A candidate group is two or more records that repeat an ISRC, a UPC or a source URL. Only a pair of exact twins is
 * merged: every identity column is equal, the credits agree in name, role and position, no link names another
 * destination for the same service unless both were found by an identifier, and the younger record has at most one
 * short URL. Every other group stays as it is and is listed with its reason.
 *
 * The short URL of the removed record becomes an alias of the kept one, so every address that was handed out still
 * opens the page. No record id needs an alias: the share pages resolve short URLs, and only the admin area resolves
 * record ids.
 *
 * @param context - Rows of the restored copy.
 * @returns The manifest, and one entry per candidate group as evidence.
 */
export const planDuplicateIdentities: Planner = async (context) => {
  const operations: RepairOperation[] = [];
  const groups: GroupEvidence[] = [];
  for (const kind of [TRACKS, ALBUMS]) {
    const { records, children } = await loadKind(kind, context.query);
    const candidates = candidateGroups(kind, records)
      .map((group) => group.sort(byAge))
      .sort((left, right) => (textOf(left[0], "id") < textOf(right[0], "id") ? -1 : 1));
    for (const group of candidates) {
      const ids = group.map((record) => textOf(record, "id"));
      if (group.length !== 2) {
        groups.push({ kind: kind.table, ids, result: "group-size" });
        continue;
      }
      const [winner, loser] = group;
      const merged = mergeTwins(kind, winner, loser, children);
      if ("reason" in merged) {
        groups.push({ kind: kind.table, ids, result: merged.reason, detail: merged.detail });
        continue;
      }
      operations.push(...merged.operations);
      groups.push({
        kind: kind.table,
        ids,
        result: "merged",
        winner: ids[0],
        loser: ids[1],
        operations: merged.operations.length,
        unreferencedArtistEntities: merged.unreferencedArtistEntities,
      });
    }
  }
  const evidence: JsonValue = {
    groups: groups as unknown as JsonValue,
    merged: groups.filter((group) => group.result === "merged").length,
    unresolved: groups.filter((group) => group.result !== "merged").length,
    operations: operations.length,
  };
  return {
    manifest: {
      formatVersion: 1,
      repair: DUPLICATE_IDENTITIES_REPAIR,
      issue: DUPLICATE_IDENTITIES_ISSUE,
      sourceArchiveSha256: context.sourceArchiveSha256,
      requiredMigrationHash: context.migrationHash,
      operations,
    },
    evidence,
  };
};
