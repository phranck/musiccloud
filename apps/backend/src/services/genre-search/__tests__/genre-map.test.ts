import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetGenreCacheForTests,
  listSupportedGenres,
  resolveGenreName,
  UnknownGenreError,
} from "@/services/genre-search/genre-map";

// Shape mirrors the real Deezer /genre response we care about.
const MOCK_GENRES = {
  data: [
    { id: 0, name: "All" }, // should be filtered out
    { id: 132, name: "Pop" },
    { id: 116, name: "Rap/Hip Hop" },
    { id: 165, name: "R&B" },
    { id: 129, name: "Jazz" },
    { id: 98, name: "Classical" },
    { id: 152, name: "Rock" },
  ],
};

function mockFetchOnce(body: unknown, init?: ResponseInit): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(body), init));
}

describe("genre-map", () => {
  beforeEach(() => {
    _resetGenreCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ───────────────────── listSupportedGenres ──────────────────────

  it("loads genres and filters out the pseudo-'All' entry", async () => {
    mockFetchOnce(MOCK_GENRES);
    const list = await listSupportedGenres();
    expect(list).toEqual(["Pop", "Rap/Hip Hop", "R&B", "Jazz", "Classical", "Rock"]);
  });

  it("caches the list across calls (second call does not hit the network)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(MOCK_GENRES)));

    await listSupportedGenres();
    await listSupportedGenres();
    await listSupportedGenres();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent loads into a single fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(MOCK_GENRES)));

    await Promise.all([listSupportedGenres(), listSupportedGenres(), listSupportedGenres()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ───────────────────── resolveGenreName ──────────────────────

  it("matches exact name case-insensitively", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("jazz");
    expect(res).toEqual({ id: 129, name: "Jazz" });
  });

  it("matches R&B with & character intact", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("r&b");
    expect(res).toEqual({ id: 165, name: "R&B" });
  });

  it("matches 'hip hop' to Deezer's 'Rap/Hip Hop' via substring", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("hip hop");
    expect(res).toEqual({ id: 116, name: "Rap/Hip Hop" });
  });

  it("matches 'hip-hop' (with hyphen) the same way", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("hip-hop");
    expect(res).toEqual({ id: 116, name: "Rap/Hip Hop" });
  });

  it("matches 'POP' case-insensitively", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("POP");
    expect(res).toEqual({ id: 132, name: "Pop" });
  });

  it("collapses extra whitespace in the input", async () => {
    mockFetchOnce(MOCK_GENRES);
    const res = await resolveGenreName("  hip   hop  ");
    expect(res).toEqual({ id: 116, name: "Rap/Hip Hop" });
  });

  // ───────────────────── Unknown genres ──────────────────────

  it("throws UnknownGenreError for an unrecognised name", async () => {
    mockFetchOnce(MOCK_GENRES);
    await expect(resolveGenreName("krautrock")).rejects.toThrow(UnknownGenreError);
  });

  it("UnknownGenreError carries the supported list for user feedback", async () => {
    mockFetchOnce(MOCK_GENRES);
    try {
      await resolveGenreName("krautrock");
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownGenreError);
      const e = err as UnknownGenreError;
      expect(e.input).toBe("krautrock");
      expect(e.supportedGenres).toContain("Jazz");
      expect(e.supportedGenres).not.toContain("All");
    }
  });

  it("throws UnknownGenreError for empty input after normalization", async () => {
    mockFetchOnce(MOCK_GENRES);
    await expect(resolveGenreName("   ")).rejects.toThrow(UnknownGenreError);
  });

  // ───────────────────── Fetch failures ──────────────────────

  it("propagates an error when Deezer returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 503 }));
    await expect(listSupportedGenres()).rejects.toThrow(/HTTP 503/);
  });
});
