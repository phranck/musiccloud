import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchArtistInfo } from "./artist-info-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchArtistInfo", () => {
  it("forwards the normalized artist entity id with the existing share context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ artistName: "Canonical Artist" })));
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
});
