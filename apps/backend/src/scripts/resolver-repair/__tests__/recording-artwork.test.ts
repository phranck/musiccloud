import { describe, expect, it } from "vitest";
import { applyManifest, RepairAborted } from "../engine.js";
import { type RowValues, sealManifest } from "../manifest.js";
import { planRecordingArtwork } from "../planners/recording-artwork.js";
import type { PlanContext } from "../planning.js";
import { REPAIRABLE_TABLES } from "../repairable-tables.js";
import { rejectedStoredArtwork } from "../stored-artwork-policy.js";
import { ARCHIVE_HASH, MemoryRowStore, MIGRATION_HASH } from "./memory-row-store.js";

const APPLE = "https://is1-ssl.mzstatic.com/image/thumb/cover.jpg";
const YOUTUBE_FRAME = "https://i.ytimg.com/vi/fixture/hqdefault.jpg";
const CHANNEL_PORTRAIT = "https://yt3.ggpht.com/portrait";
const ALLOWED = "https://cdn-images.dzcdn.net/images/cover/fixture/1000x1000.jpg";

const rows: Record<string, RowValues[]> = {
  tracks: [
    { key: "t1", url: YOUTUBE_FRAME },
    { key: "t2", url: APPLE },
    { key: "t3", url: ALLOWED },
  ],
  albums: [
    { key: "a1", url: APPLE },
    { key: "a2", url: YOUTUBE_FRAME },
    { key: "a3", url: ALLOWED },
  ],
  artist_profiles: [
    { key: "p1", url: APPLE },
    { key: "p2", url: CHANNEL_PORTRAIT },
    { key: "p3", url: ALLOWED },
  ],
};

/** A context over fixed rows; the planner asks for each table by name. */
function contextOver(data: Record<string, RowValues[]> = rows): PlanContext {
  return {
    migrationHash: MIGRATION_HASH,
    sourceArchiveSha256: ARCHIVE_HASH,
    ports: {
      fetchTrack: async () => {
        throw new Error("the artwork repair asks no provider");
      },
    },
    async query(sql) {
      return data[/FROM (\w+)/.exec(sql)?.[1] ?? ""] ?? [];
    },
  };
}

describe("which stored values the policy rejects", () => {
  it.each([
    { table: "tracks", url: APPLE, expected: "apple_artwork" },
    { table: "albums", url: APPLE, expected: "apple_artwork" },
    { table: "artist_profiles", url: APPLE, expected: "apple_artwork" },
    { table: "tracks", url: YOUTUBE_FRAME, expected: "youtube_recording_artwork" },
    { table: "albums", url: YOUTUBE_FRAME, expected: "youtube_recording_artwork" },
    { table: "artist_profiles", url: YOUTUBE_FRAME, expected: null },
    { table: "artist_profiles", url: CHANNEL_PORTRAIT, expected: null },
    { table: "tracks", url: ALLOWED, expected: null },
  ] as const)("$table $url is $expected", ({ table, url, expected }) => {
    expect(rejectedStoredArtwork(table, url)).toBe(expected);
  });
});

describe("planning the removal of rejected artwork", () => {
  it("clears Apple covers everywhere and YouTube images from covers, and leaves portraits and allowed covers alone", async () => {
    const { manifest, evidence } = await planRecordingArtwork(contextOver(), {});
    expect(manifest.operations.map((operation) => `${operation.table}/${operation.keyValue}`)).toEqual([
      "tracks/t1",
      "tracks/t2",
      "albums/a1",
      "albums/a2",
      "artist_profiles/p1",
    ]);
    expect(evidence).toEqual({
      counts: {
        tracks: { youtube_recording_artwork: 1, apple_artwork: 1 },
        albums: { apple_artwork: 1, youtube_recording_artwork: 1 },
        artist_profiles: { apple_artwork: 1 },
      },
      operations: 5,
    });
  });

  it("sets only the cover column to null, and only while it holds the recorded value", async () => {
    const { manifest } = await planRecordingArtwork(contextOver(), {});
    expect(manifest.operations[0]).toEqual({
      kind: "update-columns",
      table: "tracks",
      keyColumn: "id",
      keyValue: "t1",
      before: { artwork_url: YOUTUBE_FRAME },
      after: { artwork_url: null },
    });
    expect(manifest.operations[4]).toMatchObject({
      table: "artist_profiles",
      keyColumn: "artist_entity_id",
      before: { image_url: APPLE },
      after: { image_url: null },
    });
  });

  it("produces a manifest the runner accepts, with the provenance of the copy", async () => {
    const { manifest } = await planRecordingArtwork(contextOver(), {});
    expect(manifest).toMatchObject({
      repair: "recording-artwork",
      issue: 767,
      sourceArchiveSha256: ARCHIVE_HASH,
      requiredMigrationHash: MIGRATION_HASH,
    });
    expect(() => sealManifest(manifest, REPAIRABLE_TABLES)).not.toThrow();
  });

  it("plans nothing when every stored value is allowed", async () => {
    const { manifest } = await planRecordingArtwork(
      contextOver({
        tracks: [{ key: "t3", url: ALLOWED }],
        albums: [],
        artist_profiles: [{ key: "p2", url: CHANNEL_PORTRAIT }],
      }),
      {},
    );
    expect(manifest.operations).toEqual([]);
  });

  it("clears the values when applied and refuses to overwrite a cover somebody replaced since the plan", async () => {
    const { manifest } = await planRecordingArtwork(contextOver(), {});
    const stored = (table: string, keyColumn: string, key: string, column: string, url: string) => ({
      table,
      keyColumn,
      row: { [keyColumn]: key, [column]: url, title: "kept" },
    });
    const live = () =>
      new MemoryRowStore([
        stored("tracks", "id", "t1", "artwork_url", YOUTUBE_FRAME),
        stored("tracks", "id", "t2", "artwork_url", APPLE),
        stored("albums", "id", "a1", "artwork_url", APPLE),
        stored("albums", "id", "a2", "artwork_url", YOUTUBE_FRAME),
        stored("artist_profiles", "artist_entity_id", "p1", "image_url", APPLE),
      ]);

    const clean = live();
    await applyManifest(clean, manifest, MIGRATION_HASH);
    expect(clean.snapshot()["tracks/t1"]).toEqual({ id: "t1", artwork_url: null, title: "kept" });
    expect(clean.snapshot()["artist_profiles/p1"]).toEqual({ artist_entity_id: "p1", image_url: null, title: "kept" });

    const replaced = live();
    replaced.tamper({ table: "tracks", keyValue: "t2" }, { artwork_url: ALLOWED });
    const before = replaced.snapshot();
    await expect(applyManifest(replaced, manifest, MIGRATION_HASH)).rejects.toBeInstanceOf(RepairAborted);
    expect(replaced.snapshot()).toEqual(before);
  });
});
