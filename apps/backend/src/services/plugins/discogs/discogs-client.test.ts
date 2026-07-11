import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";

vi.mock("../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: vi.fn(),
}));

const fetchMock = vi.mocked(fetchWithTimeout);

import { getMasterVinylVersions, getRelease, isDiscogsConfigured, searchVinylMaster } from "./discogs-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SEARCH_RESPONSE_HIT = {
  results: [
    { id: 33100, title: "Kind Of Blue" },
    { id: 99999, title: "Other" },
  ],
};

const SEARCH_RESPONSE_EMPTY = { results: [] };

const VERSIONS_RESPONSE = {
  versions: [
    { id: 15815903, released: "1959", label: "Columbia", format: "LP, Album", country: "US" },
    { id: 22222222, released: "1997", label: "Columbia", format: "LP, Album, Reissue", country: "EU" },
  ],
};

const RELEASE_RESPONSE = {
  id: 15815903,
  tracklist: [
    { position: "A1", type_: "track", title: "So What", duration: "9:22" },
    { position: "A2", type_: "track", title: "Freddie Freeloader", duration: "9:46" },
    { position: "B1", type_: "track", title: "Blue in Green", duration: "5:37" },
    { position: "", type_: "heading", title: "Side B (cont.)", duration: "" },
  ],
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  process.env.DISCOGS_TOKEN = "test-token";
  process.env.DISCOGS_MIN_REQUEST_INTERVAL_MS = "0";
});

afterEach(() => {
  delete process.env.DISCOGS_TOKEN;
  delete process.env.DISCOGS_MIN_REQUEST_INTERVAL_MS;
});

// ---------------------------------------------------------------------------
// isDiscogsConfigured
// ---------------------------------------------------------------------------

describe("isDiscogsConfigured", () => {
  it("returns true when DISCOGS_TOKEN is set", () => {
    expect(isDiscogsConfigured()).toBe(true);
  });

  it("returns false when DISCOGS_TOKEN is absent", () => {
    delete process.env.DISCOGS_TOKEN;
    expect(isDiscogsConfigured()).toBe(false);
  });

  it("returns false when DISCOGS_TOKEN is an empty string", () => {
    process.env.DISCOGS_TOKEN = "";
    expect(isDiscogsConfigured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchVinylMaster
// ---------------------------------------------------------------------------

describe("searchVinylMaster", () => {
  it("returns the first result id on a hit", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SEARCH_RESPONSE_HIT));
    const result = await searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" });
    expect(result).toBe(33100);
  });

  it("calls the correct endpoint with required query params", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SEARCH_RESPONSE_HIT));
    await searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" });

    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/database/search");
    expect(calledUrl).toContain("type=master");
    expect(calledUrl).toContain("format=Vinyl");
    // Artist and title must be URL-encoded
    expect(calledUrl).toContain(encodeURIComponent("Miles Davis"));
    expect(calledUrl).toContain(encodeURIComponent("Kind Of Blue"));
  });

  it("sends Authorization and User-Agent headers", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SEARCH_RESPONSE_HIT));
    await searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Discogs token=test-token");
    expect(headers["User-Agent"]).toBeTruthy();
    expect(headers.Accept).toBe("application/json");
  });

  it("returns null when results array is empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse(SEARCH_RESPONSE_EMPTY));
    const result = await searchVinylMaster({ artist: "Nobody", title: "Nothing" });
    expect(result).toBeNull();
  });

  it("returns null and makes no HTTP call when DISCOGS_TOKEN is not set", async () => {
    delete process.env.DISCOGS_TOKEN;
    const result = await searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the HTTP response is not OK (429)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Rate limit" }, 429));
    await expect(searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" })).rejects.toThrow();
  });

  it("throws when fetchWithTimeout itself rejects (network error)", async () => {
    fetchMock.mockRejectedValue(new Error("Network failure"));
    await expect(searchVinylMaster({ artist: "Miles Davis", title: "Kind Of Blue" })).rejects.toThrow(
      "Network failure",
    );
  });
});

// ---------------------------------------------------------------------------
// getMasterVinylVersions
// ---------------------------------------------------------------------------

describe("getMasterVinylVersions", () => {
  it("hits /masters/{id}/versions?format=Vinyl", async () => {
    fetchMock.mockResolvedValue(jsonResponse(VERSIONS_RESPONSE));
    await getMasterVinylVersions(33100);

    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/masters/33100/versions");
    expect(calledUrl).toContain("format=Vinyl");
  });

  it("maps versions[] into DiscogsMasterVersion[]", async () => {
    fetchMock.mockResolvedValue(jsonResponse(VERSIONS_RESPONSE));
    const versions = await getMasterVinylVersions(33100);

    expect(versions).toHaveLength(2);
    expect(versions[0]).toEqual({ id: 15815903, released: "1959", format: "LP, Album", country: "US" });
    expect(versions[1]).toEqual({ id: 22222222, released: "1997", format: "LP, Album, Reissue", country: "EU" });
  });

  it("loads every versions page before returning the pressings", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: { page: 1, pages: 2 },
          versions: [{ id: 22222222, released: "1997", format: "LP, Album, Reissue", country: "EU" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: { page: 2, pages: 2 },
          versions: [{ id: 15815903, released: "1959", format: "LP, Album", country: "US" }],
        }),
      );

    const versions = await getMasterVinylVersions(33100);

    expect(versions.map((version) => version.id)).toEqual([22222222, 15815903]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("page=2");
  });

  it("returns [] when versions array is empty", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ versions: [] }));
    const versions = await getMasterVinylVersions(33100);
    expect(versions).toEqual([]);
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Server Error" }, 500));
    await expect(getMasterVinylVersions(33100)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getRelease
// ---------------------------------------------------------------------------

describe("getRelease", () => {
  it("hits /releases/{id}", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE_RESPONSE));
    await getRelease(15815903);

    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/releases/15815903");
  });

  it("maps tracklist[] into DiscogsRelease.tracklist preserving all entries", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RELEASE_RESPONSE));
    const release = await getRelease(15815903);

    expect(release.id).toBe(15815903);
    expect(release.tracklist).toHaveLength(4);
    expect(release.tracklist[0]).toEqual({ position: "A1", type_: "track", title: "So What", duration: "9:22" });
    expect(release.tracklist[2]).toEqual({ position: "B1", type_: "track", title: "Blue in Green", duration: "5:37" });
    // Heading entry must be preserved as-is (normalizer filters, not client)
    expect(release.tracklist[3]).toEqual({ position: "", type_: "heading", title: "Side B (cont.)", duration: "" });
  });

  it("throws on non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Not Found" }, 404));
    await expect(getRelease(99999999)).rejects.toThrow();
  });

  it("throws when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("Timeout"));
    await expect(getRelease(15815903)).rejects.toThrow("Timeout");
  });
});

// ---------------------------------------------------------------------------
// Rate guard NaN fallback
// ---------------------------------------------------------------------------

describe("rate guard interval fallback", () => {
  it("falls back to the default interval for a non-numeric env value (throttle stays active)", async () => {
    // A non-numeric value must NOT silently disable the throttle. Number.parseInt
    // would yield NaN, and `NaN < elapsed` is always false, so without the guard
    // the second request would fire immediately. Assert the second call is held
    // back until the default 1100ms interval elapses.
    // A far-future fixed clock guarantees the first call sees a large positive
    // `elapsed` (prior tests left lastRequestAt at a real, much earlier time),
    // so it is not itself throttled.
    vi.useFakeTimers({ now: 10_000_000_000_000 });
    try {
      process.env.DISCOGS_MIN_REQUEST_INTERVAL_MS = "fast";
      fetchMock.mockResolvedValue(jsonResponse(RELEASE_RESPONSE));

      // First call establishes lastRequestAt with no prior delay.
      await getRelease(15815903);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call must be throttled: it is still pending before the interval.
      const secondCall = getRelease(15815903);
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // After the default 1100ms interval elapses, the second call proceeds.
      await vi.advanceTimersByTimeAsync(700);
      await secondCall;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("spaces concurrent requests instead of releasing them in one burst", async () => {
    vi.useFakeTimers({ now: 20_000_000_000_000 });
    try {
      process.env.DISCOGS_MIN_REQUEST_INTERVAL_MS = "1000";
      const requestTimes: number[] = [];
      fetchMock.mockImplementation(async () => {
        requestTimes.push(Date.now());
        return jsonResponse(RELEASE_RESPONSE);
      });

      const requests = [getRelease(1), getRelease(2), getRelease(3)];
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      await Promise.all(requests);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(requestTimes).toEqual([20_000_000_000_000, 20_000_000_001_000, 20_000_000_002_000]);
    } finally {
      vi.useRealTimers();
    }
  });
});
