import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { findArtistCache, findArtistInfoEntity, saveArtistCache } from "./postgres-artists.js";

describe("artist-info entity repository helpers", () => {
  it("reads an exact entity through its preferred persisted name", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ artist_entity_id: "artist-entity-1", artist_name: "Canonical Artist" }],
    });
    const pool = { query } as unknown as Pool;

    await expect(findArtistInfoEntity(pool, "artist-entity-1")).resolves.toEqual({
      artistEntityId: "artist-entity-1",
      artistName: "Canonical Artist",
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM artist_entities ae"), ["artist-entity-1"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("name_type = 'canonical'"), ["artist-entity-1"]);
  });

  it("uses a namespace disjoint from legacy artist-name cache rows", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await findArtistCache(pool, { kind: "name", artistName: "entity:artist-entity-1" });
    await findArtistCache(pool, { kind: "entity", artistEntityId: "artist-entity-1" });

    expect(query.mock.calls[0]?.[1]).toEqual(["artist-entity:artist-entity-1"]);
    expect(query.mock.calls[1]?.[1]).toEqual(["artistEntity:artist-entity-1"]);
  });

  it("persists an entity cache row in its entity namespace", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await saveArtistCache(pool, {
      identity: { kind: "entity", artistEntityId: "artist-entity-1" },
      artistName: "Canonical Artist",
      topTracks: [],
    });

    expect(query.mock.calls[0]?.[1]?.[0]).toBe("artistEntity:artist-entity-1");
  });
});
