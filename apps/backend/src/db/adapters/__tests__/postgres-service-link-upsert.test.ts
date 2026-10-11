/**
 * The three link tables are written by one statement, and the statement has to
 * replace the match method along with the URL and confidence. The album cache
 * trusts a stored link by its method, so a row that kept the method of its
 * first write would be trusted or distrusted for the wrong reason.
 *
 * A recording pool stands in for PostgreSQL, because what is under test is the
 * statement each writer sends rather than what a database does with it. The
 * integration test beside this one checks the stored value against a real
 * database where one is configured.
 */
import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { addLinksToAlbum } from "../postgres-albums.js";
import { addLinksToArtist } from "../postgres-artists.js";
import { addLinksToTrack } from "../postgres-tracks.js";

/** A pool whose one client records every statement and answers each with one row. */
function recordingPool(): { pool: Pool; statements: Array<{ sql: string; params: unknown[] }> } {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      // `addLinksToArtist` checks that the entity exists before writing.
      return { rows: [{ id: "entity" }], rowCount: 1 };
    },
    release: () => {},
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, statements };
}

const link = { service: "deezer", url: "https://www.deezer.com/album/1", confidence: 1, matchMethod: "upc" };

describe("service link upserts", () => {
  it.each([
    ["track", "service_links", addLinksToTrack],
    ["album", "album_service_links", addLinksToAlbum],
    ["artist", "artist_service_links", addLinksToArtist],
  ] as const)("replace the match method of an existing %s link", async (_kind, table, addLinks) => {
    const { pool, statements } = recordingPool();

    await addLinks(pool, "entity", [link]);

    const upserts = statements.filter(({ sql }) => sql.includes(`INSERT INTO ${table} (`));
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.sql).toMatch(
      /ON CONFLICT \(\w+, service\) DO UPDATE SET[\s\S]*match_method = EXCLUDED\.match_method/,
    );
    expect(upserts[0]?.params).toContain("upc");
  });
});
