import { afterEach, describe, expect, it, vi } from "vitest";

import { artistFetchErrorCode, fetchArtistInfo } from "./artist-info-client";

const ARTIST_INFO = {
  artistName: "Canonical Artist",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchArtistInfo", () => {
  it("forwards the normalized artist entity id with the existing share context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchArtistInfo(
      "Ambiguous Artist",
      "AT",
      { shortId: "share1", artistEntityId: "artist-entity-1" },
      new AbortController().signal,
    );

    const [requestUrl] = fetchMock.mock.calls[0] as [string];
    const url = new URL(requestUrl, "https://musiccloud.test");
    expect(url.pathname).toBe("/api/artist-info");
    expect(url.searchParams.get("name")).toBe("Ambiguous Artist");
    expect(url.searchParams.get("shortId")).toBe("share1");
    expect(url.searchParams.get("artistEntityId")).toBe("artist-entity-1");
  });

  it("retries one transport failure before returning a response", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArtistInfo("Canonical Artist", "", {}, new AbortController().signal)).resolves.toEqual(
      ARTIST_INFO,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([502, 503, 504])("retries one transient HTTP %i response before consuming its body", async (status) => {
    const transient = new Response(JSON.stringify({ error: "MC-API-0001" }), { status });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(transient)
      .mockResolvedValueOnce(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArtistInfo("Canonical Artist", "", {}, new AbortController().signal)).resolves.toEqual(
      ARTIST_INFO,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(transient.bodyUsed).toBe(false);
  });

  it("does not retry a canonical client error and preserves its code and incident id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "MC-REQ-0001",
          errorId: "9f3d4989-6b18-4a38-b1f8-8b8633a8f1b2",
          message: "The request is invalid. (MC-REQ-0001)",
        }),
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = await fetchArtistInfo("Canonical Artist", "", {}, new AbortController().signal).catch(
      (caught) => caught,
    );
    expect(error).toMatchObject({
      error: "MC-REQ-0001",
      errorId: "9f3d4989-6b18-4a38-b1f8-8b8633a8f1b2",
      message: "The request is invalid. (MC-REQ-0001)",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(artistFetchErrorCode(error)).toBe("MC-REQ-0001");
  });

  it("does not retry an abort or a consumed successful response", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArtistInfo("Canonical Artist", "", {}, new AbortController().signal)).rejects.toBe(abort);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValue(new Response("not json"));
    await expect(fetchArtistInfo("Canonical Artist", "", {}, new AbortController().signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
