import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artistFetchErrorCode,
  fetchArtistInfo,
  fetchCcArtistInfo,
  prefetchArtistInfo,
  takeSettledArtistInfo,
} from "./artist-info-client";

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

describe("prefetchArtistInfo", () => {
  /**
   * The landing page holds the result for its reveal animation, and the column
   * asks only when it mounts. A prefetch started at the resolve answer has to be
   * taken over by the column, not duplicated.
   */
  it("lets the column take over a prefetched request instead of sending a second one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);
    const context = { shortId: "prefetch1", artistEntityId: "artist-prefetch-1" };

    prefetchArtistInfo("Prefetched Artist", "AT", context);
    const data = await fetchArtistInfo("Prefetched Artist", "AT", context, new AbortController().signal);

    expect(data).toEqual(ARTIST_INFO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands a prefetch failure to the column that claims it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "MC-REQ-0001", errorId: "prefetch-incident" }), { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    prefetchArtistInfo("Failing Artist", "", {});
    const failure = await fetchArtistInfo("Failing Artist", "", {}, new AbortController().signal).catch(
      (error: unknown) => error,
    );

    expect(artistFetchErrorCode(failure)).toBe("MC-REQ-0001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands an answered prefetch over synchronously, once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);
    const context = { artistEntityId: "artist-settled-1" };

    prefetchArtistInfo("Settled Artist", "AT", context);
    expect(takeSettledArtistInfo("Settled Artist", "AT", context)).toBeNull();

    await vi.waitFor(() => expect(takeSettledArtistInfo("Settled Artist", "AT", context)).toEqual(ARTIST_INFO));
    expect(takeSettledArtistInfo("Settled Artist", "AT", context)).toBeNull();
  });

  it("does not hand over a failed prefetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "MC-REQ-0001" }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    prefetchArtistInfo("Failed Settled Artist", "", {});
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await Promise.resolve();

    expect(takeSettledArtistInfo("Failed Settled Artist", "", {})).toBeNull();
  });

  it("sends a request of its own for different arguments", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    prefetchArtistInfo("One Artist", "", {});
    await fetchArtistInfo("Another Artist", "", {}, new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("fetchCcArtistInfo", () => {
  /**
   * A Jamendo outage arrives as 503 with MC-API-0001. Reporting it as a bare
   * status code is what put "HTTP 500" on screen, so the CC path has to yield
   * the same canonical error the commercial one does.
   */
  it("reports an upstream outage with the canonical code rather than a status string", async () => {
    const body = JSON.stringify({
      error: "MC-API-0001",
      errorId: "incident-1",
      message: "A required upstream service is unavailable. (MC-API-0001)",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body, { status: 503 }))
      .mockResolvedValueOnce(new Response(body, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const failure = await fetchCcArtistInfo("104", "Tryad", new AbortController().signal).catch(
      (error: unknown) => error,
    );

    expect(artistFetchErrorCode(failure)).toBe("MC-API-0001");
    expect((failure as { errorId?: string }).errorId).toBe("incident-1");
  });

  it("retries a transient status once before giving up", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCcArtistInfo("104", "Tryad", new AbortController().signal)).resolves.toEqual(ARTIST_INFO);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the artist id and name the column was asked for", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(ARTIST_INFO)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCcArtistInfo("104", "Tryad", new AbortController().signal);

    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain("jamendoArtistId=104");
    expect(requested).toContain("artistName=Tryad");
  });
});
