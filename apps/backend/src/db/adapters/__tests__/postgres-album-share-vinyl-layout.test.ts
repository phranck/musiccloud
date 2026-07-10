import type { VinylLayout } from "@musiccloud/shared";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { loadAlbumByShortId } from "../postgres-albums.js";

const vinylLayout: VinylLayout = {
  discogsReleaseId: "15815903",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon", durationMs: 1_210_000 }] }],
};

function buildRow(layout: VinylLayout | null) {
  return {
    id: "album-id",
    title: "The Sermon!",
    artists: '["Jimmy Smith"]',
    artist_credits: "[]",
    release_date: "1959-01-01",
    total_tracks: 3,
    artwork_url: "https://example.com/the-sermon.jpg",
    label: "Blue Note",
    upc: "094635000000",
    source_service: "spotify",
    source_url: "https://open.spotify.com/album/album-id",
    preview_url: null,
    vinyl_layout: layout,
    link_url: null,
    service: null,
    confidence: null,
    match_method: null,
    short_id: "album-short",
    created_at: new Date("2026-07-11T00:00:00Z"),
    updated_at: new Date("2026-07-11T00:00:00Z"),
  };
}

describe("loadAlbumByShortId vinyl layout projection", () => {
  it("returns a positive layout from the existing short-id query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [buildRow(vinylLayout)] });

    const result = await loadAlbumByShortId({ query } as unknown as Pool, "album-short");

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("album_vinyl_layouts");
    expect(result?.album.vinylLayout).toEqual(vinylLayout);
  });

  it("returns a negative cache marker as null from the existing short-id query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [buildRow(null)] });

    const result = await loadAlbumByShortId({ query } as unknown as Pool, "album-short");

    expect(query).toHaveBeenCalledTimes(1);
    expect(result?.album.vinylLayout).toBeNull();
  });
});
