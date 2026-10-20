import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json.js";
import { applyManifest } from "../engine.js";
import { invertManifest, type RowValues, sealManifest } from "../manifest.js";
import { type GroupEvidence, planDuplicateIdentities } from "../planners/duplicate-identities.js";
import type { PlanContext } from "../planning.js";
import { REPAIRABLE_TABLES } from "../repairable-tables.js";
import { ARCHIVE_HASH, MemoryRowStore, MIGRATION_HASH } from "./memory-row-store.js";

type Data = Record<string, RowValues[]>;

const NEWER = "2026-07-30T10:00:00.256+00:00";
const OLDER = "2026-07-30T10:00:00.100+00:00";

const track = (id: string, overrides: RowValues = {}): RowValues => ({
  id,
  title: "Goodbye",
  album_name: "Album",
  duration_ms: 358000,
  source_service: "deezer",
  source_url: "https://www.deezer.com/track/1",
  isrc: "CA1TB2400010",
  release_date: "2024-01-01",
  is_explicit: 0,
  artwork_url: null,
  created_at: OLDER,
  updated_at: OLDER,
  ...overrides,
});
const shortUrl = (trackId: string, id: string): RowValues => ({ id, track_id: trackId, created_at: OLDER });
const link = (trackId: string, service: string, overrides: RowValues = {}): RowValues => ({
  id: `${trackId}-${service}`,
  track_id: trackId,
  service,
  external_id: `${service}-1`,
  url: `https://${service}.example/1`,
  confidence: 0.99,
  match_method: "search",
  created_at: OLDER,
  ...overrides,
});
const observation = (trackId: string, source: string, id = `${trackId}-${source}-obs`): RowValues => ({
  id,
  track_id: trackId,
  id_type: "isrc",
  id_value: "CA1TB2400010",
  source_service: source,
  observed_at: OLDER,
});
const preview = (trackId: string, service: string): RowValues => ({
  id: `${trackId}-${service}-preview`,
  track_id: trackId,
  service,
  url: `https://cdn.example/${trackId}/${service}.mp3`,
  expires_at: null,
  observed_at: OLDER,
});
const credit = (trackId: string, entity: string, name = "Devin Townsend"): RowValues => ({
  id: `${trackId}-credit-${entity}`,
  track_id: trackId,
  artist_entity_id: entity,
  credit_name: name,
  credit_position: 0,
  credit_role: "main",
  created_at: OLDER,
});
const miss = (trackId: string, service: string): RowValues => ({
  id: `${trackId}-${service}`,
  track_id: trackId,
  service,
  checked_at: OLDER,
});

/** Two twin tracks, `old` and `new`, with the rows that normally surround them. */
function twinTracks(): Data {
  return {
    tracks: [track("old"), track("new", { created_at: NEWER, updated_at: NEWER })],
    short_urls: [shortUrl("old", "short-old"), shortUrl("new", "short-new")],
    service_links: [link("old", "deezer"), link("old", "spotify"), link("new", "deezer"), link("new", "spotify")],
    track_external_ids: [observation("old", "deezer"), observation("new", "deezer", "new-deezer-obs")],
    track_previews: [preview("old", "deezer"), preview("new", "deezer")],
    track_artist_credits: [credit("old", "entity-a"), credit("new", "entity-a")],
    service_link_misses: [miss("new", "tidal")],
  };
}

const ALL_TABLES = [
  "tracks",
  "short_urls",
  "service_links",
  "track_external_ids",
  "track_previews",
  "track_artist_credits",
  "service_link_misses",
  "albums",
  "album_short_urls",
  "album_service_links",
  "album_external_ids",
  "album_previews",
  "album_artist_credits",
];

/** A context over fixed rows. The planner asks for each table by name, and child tables by the records' ids. */
function contextOver(data: Data): PlanContext {
  return {
    migrationHash: MIGRATION_HASH,
    sourceArchiveSha256: ARCHIVE_HASH,
    ports: {
      fetchTrack: async () => {
        throw new Error("the duplicate repair asks no provider");
      },
    },
    async query(sql, parameters) {
      const table = /FROM (\w+)/.exec(sql)?.[1] ?? "";
      const rows = data[table] ?? [];
      const column = /WHERE (\w+) = ANY/.exec(sql)?.[1];
      if (!column) return rows;
      const wanted = new Set(parameters?.[0] as string[]);
      return rows.filter((row) => wanted.has(row[column] as string));
    },
  };
}

/** A store holding every row of the data under its table, with the alias tables empty. */
function storeFor(data: Data): MemoryRowStore {
  return new MemoryRowStore(
    ALL_TABLES.flatMap((table) => (data[table] ?? []).map((row) => ({ table, keyColumn: "id", row }))),
  );
}

async function plan(data: Data) {
  return planDuplicateIdentities(contextOver(data), {});
}

/** The evidence entries of a plan. */
function groupsOf(result: Awaited<ReturnType<typeof plan>>): GroupEvidence[] {
  return (result.evidence as unknown as { groups: GroupEvidence[] }).groups;
}

describe("merging a pair of exact twins", () => {
  it("keeps the older record and removes everything that belongs to the younger one", async () => {
    const data = twinTracks();
    const result = await plan(data);
    expect(groupsOf(result)).toEqual([
      expect.objectContaining({ kind: "tracks", ids: ["old", "new"], result: "merged", winner: "old", loser: "new" }),
    ]);
    const store = storeFor(data);
    await applyManifest(store, result.manifest, MIGRATION_HASH);
    const after = store.snapshot();
    expect(after["tracks/old"]).toEqual(data.tracks[0]);
    expect(Object.keys(after).filter((key) => /new/.test(key) && !key.startsWith("track_short_url_aliases"))).toEqual(
      [],
    );
    expect(after["short_urls/short-old"]).toBeDefined();
  });

  it("turns the short URL of the removed record into an alias of the kept one", async () => {
    const result = await plan(twinTracks());
    expect(result.manifest.operations.slice(0, 2)).toEqual([
      expect.objectContaining({ kind: "delete-row", table: "short_urls", keyValue: "short-new" }),
      expect.objectContaining({
        kind: "insert-row",
        table: "track_short_url_aliases",
        keyValue: "short-new",
        row: { id: "short-new", track_id: "old", created_at: OLDER },
      }),
    ]);
  });

  it("moves a link that only the removed record has, under the id the kept record's links use", async () => {
    const data = twinTracks();
    data.service_links = [link("old", "deezer"), link("new", "deezer"), link("new", "qobuz")];
    const result = await plan(data);
    const store = storeFor(data);
    await applyManifest(store, result.manifest, MIGRATION_HASH);
    expect(store.snapshot()["service_links/old-qobuz"]).toEqual({
      ...link("new", "qobuz"),
      id: "old-qobuz",
      track_id: "old",
    });
    expect(store.snapshot()["service_links/new-qobuz"]).toBeUndefined();
  });

  it("keeps the kept record's link when both were found by an identifier and name different catalog entries", async () => {
    const data = twinTracks();
    data.service_links = [
      link("old", "tidal", { match_method: "isrc", url: "https://tidal.example/1" }),
      link("new", "tidal", { match_method: "isrc", url: "https://tidal.example/2" }),
    ];
    const result = await plan(data);
    expect(groupsOf(result)[0].result).toBe("merged");
    const store = storeFor(data);
    await applyManifest(store, result.manifest, MIGRATION_HASH);
    expect(store.snapshot()["service_links/old-tidal"]).toMatchObject({ url: "https://tidal.example/1" });
  });

  it("moves identifier observations and previews that only the removed record has, and drops the duplicates", async () => {
    const data = twinTracks();
    data.track_external_ids = [
      observation("old", "deezer"),
      observation("new", "deezer", "new-a"),
      observation("new", "spotify", "new-b"),
    ];
    data.track_previews = [preview("old", "deezer"), preview("new", "deezer"), preview("new", "tidal")];
    const result = await plan(data);
    const store = storeFor(data);
    await applyManifest(store, result.manifest, MIGRATION_HASH);
    const after = store.snapshot();
    expect(after["track_external_ids/new-b"]).toMatchObject({ track_id: "old", source_service: "spotify" });
    expect(after["track_external_ids/new-a"]).toBeUndefined();
    expect(after["track_previews/new-tidal-preview"]).toMatchObject({ track_id: "old" });
    expect(after["track_previews/new-deezer-preview"]).toBeUndefined();
  });

  it("drops the removed record's recorded misses", async () => {
    const result = await plan(twinTracks());
    expect(result.manifest.operations.map((operation) => `${operation.table}/${operation.keyValue}`)).toContain(
      "service_link_misses/new-tidal",
    );
  });

  it("names artist entities that only the removed record's credits referenced, without merging them", async () => {
    const data = twinTracks();
    data.track_artist_credits = [credit("old", "entity-a"), credit("new", "entity-b")];
    const result = await plan(data);
    expect(groupsOf(result)[0]).toMatchObject({ result: "merged", unreferencedArtistEntities: ["entity-b"] });
    expect(result.manifest.operations.some((operation) => operation.table === "artist_entities")).toBe(false);
  });

  it("is undone completely by the inverse manifest", async () => {
    const data = twinTracks();
    const { manifest } = await plan(data);
    const store = storeFor(data);
    const original = store.snapshot();
    await applyManifest(store, manifest, MIGRATION_HASH);
    expect(store.snapshot()).not.toEqual(original);
    await applyManifest(store, invertManifest(manifest), MIGRATION_HASH);
    expect(store.snapshot()).toEqual(original);
  });

  it("produces a manifest the runner accepts, and the same text every time", async () => {
    const first = await plan(twinTracks());
    const second = await plan(twinTracks());
    expect(() => sealManifest(first.manifest, REPAIRABLE_TABLES)).not.toThrow();
    expect(canonicalJson(first.manifest)).toBe(canonicalJson(second.manifest));
  });

  it("keeps the record with the older creation time, and the smaller id when they are equal", async () => {
    const swapped = twinTracks();
    swapped.tracks = [track("old", { created_at: NEWER }), track("new", { created_at: OLDER })];
    expect(groupsOf(await plan(swapped))[0]).toMatchObject({ winner: "new", loser: "old" });
    const tied = twinTracks();
    tied.tracks = [track("b", { created_at: OLDER }), track("a", { created_at: OLDER })];
    tied.short_urls = [shortUrl("a", "short-a"), shortUrl("b", "short-b")];
    tied.service_links = [];
    tied.track_external_ids = [];
    tied.track_previews = [];
    tied.track_artist_credits = [];
    tied.service_link_misses = [];
    expect(groupsOf(await plan(tied))[0]).toMatchObject({ winner: "a", loser: "b" });
  });
});

describe("leaving a group as it is", () => {
  it.each([
    {
      name: "a different title",
      change: (data: Data) => (data.tracks[1] = track("new", { title: "Goodbye (Live)", created_at: NEWER })),
      reason: "identity-differs",
      detail: "title",
    },
    {
      name: "a different duration",
      change: (data: Data) => (data.tracks[1] = track("new", { duration_ms: 400000, created_at: NEWER })),
      reason: "identity-differs",
      detail: "duration_ms",
    },
    {
      name: "a different cover",
      change: (data: Data) =>
        (data.tracks[1] = track("new", { artwork_url: "https://cdn.example/other.jpg", created_at: NEWER })),
      reason: "identity-differs",
      detail: "artwork_url",
    },
    {
      name: "a credit with another name",
      change: (data: Data) => (data.track_artist_credits[1] = credit("new", "entity-a", "Another Artist")),
      reason: "credits-differ",
    },
    {
      name: "two destinations for one service found by search",
      change: (data: Data) => (data.service_links[2] = link("new", "deezer", { url: "https://deezer.example/other" })),
      reason: "link-conflict",
      detail: "deezer",
    },
    {
      name: "a destination whose id does not follow the convention",
      change: (data: Data) => (data.service_links = [link("old", "deezer"), link("new", "qobuz", { id: "odd" })]),
      reason: "link-id-unexpected",
      detail: "qobuz",
    },
  ])("$name", async ({ change, reason, detail }) => {
    const data = twinTracks();
    change(data);
    const result = await plan(data);
    expect(result.manifest.operations).toEqual([]);
    expect(groupsOf(result)[0]).toMatchObject({ result: reason, ...(detail ? { detail } : {}) });
  });

  it("does not merge three records into one on its own", async () => {
    const data = twinTracks();
    data.tracks.push(track("newer", { created_at: "2026-07-30T10:00:00.400+00:00" }));
    const result = await plan(data);
    expect(result.manifest.operations).toEqual([]);
    expect(groupsOf(result)[0]).toMatchObject({ result: "group-size", ids: ["old", "new", "newer"] });
  });

  it("ignores records that repeat nothing", async () => {
    const data = twinTracks();
    data.tracks = [track("lonely", { isrc: "OTHER", source_url: "https://example.test/lonely" })];
    expect((await plan(data)).manifest.operations).toEqual([]);
  });

  it("joins records that share only a source URL, as two YouTube twins without an ISRC do", async () => {
    const data = twinTracks();
    data.tracks = [
      track("old", { isrc: null, source_service: "youtube", source_url: "https://www.youtube.com/watch?v=x" }),
      track("new", {
        isrc: null,
        source_service: "youtube",
        source_url: "https://www.youtube.com/watch?v=x",
        created_at: NEWER,
      }),
    ];
    expect(groupsOf(await plan(data))[0]).toMatchObject({ result: "merged" });
  });
});

describe("merging a pair of albums", () => {
  const album = (id: string, overrides: RowValues = {}): RowValues => ({
    id,
    title: "Space Shanty",
    release_date: "2014-01-01",
    total_tracks: 8,
    artwork_url: null,
    label: "Label",
    upc: "4015306161818",
    source_service: "qobuz",
    source_url: "https://open.qobuz.com/album/1",
    created_at: OLDER,
    updated_at: OLDER,
    ...overrides,
  });

  it("uses the album tables and an album alias", async () => {
    const data: Data = {
      albums: [album("album-old"), album("album-new", { created_at: NEWER })],
      album_short_urls: [
        { id: "ashort-old", album_id: "album-old", created_at: OLDER },
        { id: "ashort-new", album_id: "album-new", created_at: OLDER },
      ],
      album_service_links: [
        {
          id: "album-old-spotify",
          album_id: "album-old",
          service: "spotify",
          external_id: "1",
          url: "https://s.example/1",
          confidence: 1,
          match_method: "upc",
          created_at: OLDER,
        },
        {
          id: "album-new-spotify",
          album_id: "album-new",
          service: "spotify",
          external_id: "1",
          url: "https://s.example/1",
          confidence: 1,
          match_method: "upc",
          created_at: OLDER,
        },
      ],
      album_artist_credits: [
        {
          id: "c1",
          album_id: "album-old",
          artist_entity_id: "e",
          credit_name: "Khan",
          credit_position: 0,
          credit_role: "main",
          created_at: OLDER,
        },
        {
          id: "c2",
          album_id: "album-new",
          artist_entity_id: "e",
          credit_name: "Khan",
          credit_position: 0,
          credit_role: "main",
          created_at: OLDER,
        },
      ],
    };
    const result = await plan(data);
    expect(groupsOf(result)[0]).toMatchObject({
      kind: "albums",
      result: "merged",
      winner: "album-old",
      loser: "album-new",
    });
    const tables = new Set(result.manifest.operations.map((operation) => operation.table));
    expect([...tables].sort()).toEqual([
      "album_artist_credits",
      "album_service_links",
      "album_short_url_aliases",
      "album_short_urls",
      "albums",
    ]);
    expect(() => sealManifest(result.manifest, REPAIRABLE_TABLES)).not.toThrow();
  });
});
