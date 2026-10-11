/**
 * An album's release date is stored the way `normalizeReleaseDate` returns it,
 * as a track's is. The share page and the resolve response then read one
 * value the same way, and a date that does not exist never reaches a column
 * the share response declares as `format: date`.
 *
 * A recording pool stands in for PostgreSQL, because what is under test is the
 * value the persist sends rather than what a database does with it.
 */
import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { normalizeReleaseDate } from "../../../lib/release-date.js";
import { persistAlbumWithLinks } from "../postgres-albums.js";

/** A pool whose one client records every statement and answers with no rows, except for a minted short id. */
function recordingPool(): { pool: Pool; statements: Array<{ sql: string; params: unknown[] }> } {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      if (sql.includes("INSERT INTO album_short_urls")) return { rows: [{ id: params[0] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  return { pool, statements };
}

describe("persistAlbumWithLinks release date", () => {
  it.each([
    ["an impossible calendar date", "2009-02-31"],
    ["an RFC-2822 date", "15 Sep 2025 00:00:00 GMT"],
    ["a year and month", "1975-11"],
    ["an ISO timestamp", "2009-10-07T23:12:34Z"],
    ["a bare year", "1975"],
  ])("stores %s as the normalizer returns it", async (_label, releaseDate) => {
    const { pool, statements } = recordingPool();

    await persistAlbumWithLinks(pool, {
      sourceAlbum: { title: "Fixture", artists: [], releaseDate, sourceUrl: "https://example.test/album/1" },
      links: [],
    });

    const insert = statements.find(({ sql }) => sql.includes("INSERT INTO albums"));
    // The release date is the third value of the insert.
    expect(insert?.params[2]).toBe(normalizeReleaseDate(releaseDate));
  });
});
