import type { ArtistInfoResponse } from "@musiccloud/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Hoisted so the (hoisted) vi.mock factory can reference the spy.
const { fetchArtistInfoMock, takeSettledArtistInfoMock } = vi.hoisted(() => ({
  fetchArtistInfoMock: vi.fn(),
  takeSettledArtistInfoMock: vi.fn(() => null),
}));

vi.mock("@/lib/share/artist-info-client", () => ({
  ARTIST_INFO_FETCH_TIMEOUT_MS: 15000,
  fetchArtistInfo: fetchArtistInfoMock,
  takeSettledArtistInfo: takeSettledArtistInfoMock,
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

  /**
   * The resolve answer starts the column's request, which has usually answered
   * by the time the result is revealed. Starting in the loading state anyway
   * made the column render skeletons and Flip them away in the reveal frames.
   */
  it("starts ready with an answered prefetch and sends no first request", () => {
    takeSettledArtistInfoMock.mockReturnValueOnce(ARTIST_DATA as never);

    const { result } = renderHook((props) => useArtistInfo(props), { initialProps: baseProps });

    expect(result.current.status).toBe(ArtistLoadStatus.Ready);
    expect(result.current.artistData).toEqual(ARTIST_DATA);
    expect(fetchArtistInfoMock).not.toHaveBeenCalled();
  });

  it("still fetches when a later artist has no answered prefetch", async () => {
    takeSettledArtistInfoMock.mockReturnValueOnce(ARTIST_DATA as never);
    fetchArtistInfoMock.mockResolvedValue({ ...ARTIST_DATA, artistName: "Artist Two" });
    const { result, rerender } = renderHook((props) => useArtistInfo(props), { initialProps: baseProps });

    rerender({ ...baseProps, artistName: "Artist Two", context: {} });

    await waitFor(() => expect(result.current.artistData?.artistName).toBe("Artist Two"));
    expect(fetchArtistInfoMock).toHaveBeenCalledTimes(1);
  });
});
