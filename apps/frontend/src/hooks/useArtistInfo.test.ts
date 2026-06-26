import type { ArtistInfoResponse } from "@musiccloud/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted so the (hoisted) vi.mock factory can reference the spy.
const { fetchArtistInfoMock } = vi.hoisted(() => ({ fetchArtistInfoMock: vi.fn() }));

vi.mock("@/lib/share/artist-info-client", () => ({
  fetchArtistInfo: fetchArtistInfoMock,
  fetchCcArtistInfo: vi.fn(),
  artistFetchErrorCode: (err: unknown) => (err instanceof Error ? err.message : "ERR"),
}));

import { ArtistLoadStatus, useArtistInfo } from "./useArtistInfo";

const ARTIST_DATA: ArtistInfoResponse = {
  artistName: "Artist One",
  topTracks: [],
  profile: {
    imageUrl: null,
    genres: [],
    popularity: null,
    followers: null,
    bioSummary: "A bio.",
    scrobbles: null,
    similarArtists: [],
  },
  events: [],
  similarArtistTracks: [],
};

const baseProps = {
  artistName: "Artist One",
  userRegion: "",
  context: {},
  skipArtistFetch: false,
};

afterEach(() => {
  fetchArtistInfoMock.mockReset();
});

describe("useArtistInfo", () => {
  it("keeps the last-known data when a later fetch fails, so a failed refetch never blanks the column", async () => {
    fetchArtistInfoMock.mockResolvedValue(ARTIST_DATA);

    const { result, rerender } = renderHook((props) => useArtistInfo(props), { initialProps: baseProps });

    await waitFor(() => expect(result.current.status).toBe(ArtistLoadStatus.Ready));
    expect(result.current.artistData).toEqual(ARTIST_DATA);

    // A later load (new artist) rejects: the reducer keeps the prior data and
    // only flips the status to error.
    fetchArtistInfoMock.mockReset();
    fetchArtistInfoMock.mockRejectedValue(new Error("TIMEOUT"));
    rerender({ ...baseProps, artistName: "Artist Two", context: {} });

    await waitFor(() => expect(result.current.status).toBe(ArtistLoadStatus.Error));
    expect(result.current.artistData).toEqual(ARTIST_DATA);
    expect(result.current.errorCode).toBe("TIMEOUT");
  });
});
