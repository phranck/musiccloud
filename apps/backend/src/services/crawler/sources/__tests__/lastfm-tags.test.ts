import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();
const deviationMock = vi.fn();

vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) => fetchWithTimeoutMock(url, init, timeoutMs),
}));

vi.mock("../../../../lib/infra/logger.js", () => ({
  log: { deviation: (...args: unknown[]) => deviationMock(...args) },
}));

import { CrawlerSourceConfigurationError } from "../../types.js";
import { lastfmTagsSource } from "../lastfm-tags.js";

const originalApiKey = process.env.LASTFM_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  deviationMock.mockReset();
  process.env.LASTFM_API_KEY = "test-key";
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalApiKey === undefined) delete process.env.LASTFM_API_KEY;
  else process.env.LASTFM_API_KEY = originalApiKey;
});

describe("lastfmTagsSource manifest and configuration", () => {
  it("declares the disabled production defaults", () => {
    expect(lastfmTagsSource).toMatchObject({
      id: "lastfm-tags",
      displayName: "Last.fm Tag Tops",
      defaultIntervalMinutes: 360,
      defaultEnabled: false,
      defaultConfig: { tags: [], limit: 50 },
    });
  });

  it("normalizes tags before persisting the source configuration", () => {
    expect(lastfmTagsSource.parseConfig({ tags: [" Rock ", "Dream   Pop"], limit: 12 })).toEqual({
      tags: ["rock", "dream pop"],
      limit: 12,
    });
  });

  it("keeps the disabled default configuration valid but rejects it for execution", () => {
    const config = lastfmTagsSource.parseConfig({});

    expect(config).toEqual({ tags: [], limit: 50 });
    expect(() => lastfmTagsSource.assertAvailable(config)).toThrow(CrawlerSourceConfigurationError);
  });

  it.each([
    { tags: "rock", limit: 50 },
    { tags: [""], limit: 50 },
    { tags: ["x".repeat(101)], limit: 50 },
    { tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`), limit: 50 },
    { tags: ["rock", " ROCK "], limit: 50 },
    { tags: ["rock"], limit: 0 },
    { tags: ["rock"], limit: 101 },
    { tags: ["rock"], limit: 1.5 },
    { tags: ["rock"], limit: "50" },
    { tags: ["rock"], limit: 50, extra: true },
  ])("rejects invalid source configuration %#", (config) => {
    expect(() => lastfmTagsSource.parseConfig(config)).toThrow(CrawlerSourceConfigurationError);
  });

  it("rejects execution without credentials without exposing credential metadata", () => {
    delete process.env.LASTFM_API_KEY;
    const config = lastfmTagsSource.parseConfig({ tags: ["rock"], limit: 50 });

    expect(() => lastfmTagsSource.assertAvailable(config)).toThrow(CrawlerSourceConfigurationError);
    try {
      lastfmTagsSource.assertAvailable(config);
    } catch (error) {
      expect(error).toBeInstanceOf(CrawlerSourceConfigurationError);
      expect((error as Error).message).not.toMatch(/lastfm|api.?key/i);
    }
  });
});

describe("lastfmTagsSource.fetch", () => {
  it("emits complete search candidates, deduplicates them across tags, and counts skipped rows", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(
        jsonResponse({
          tracks: {
            track: [
              { name: " Song A ", artist: { name: " Artist X " } },
              { name: "", artist: { name: "Artist X" } },
              { name: "Song B", artist: { name: "Artist Y" } },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          tracks: {
            track: [
              { name: "song   a", artist: { name: "artist x" } },
              { name: "Song C", artist: { name: "Artist Z" } },
              { name: "Song D", artist: {} },
            ],
          },
        }),
      );

    const result = await lastfmTagsSource.fetch({ tags: ["rock", "pop"], limit: 3 }, null);

    expect(result).toEqual({
      candidates: [
        { kind: "search", title: "Song A", artist: "Artist X" },
        { kind: "search", title: "Song B", artist: "Artist Y" },
        { kind: "search", title: "Song C", artist: "Artist Z" },
      ],
      skipped: 3,
      nextCursor: null,
    });
    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(2);
    for (const [url, init, timeoutMs] of fetchWithTimeoutMock.mock.calls) {
      const requestUrl = new URL(url as string);
      expect(requestUrl.searchParams.get("method")).toBe("tag.getTopTracks");
      expect(requestUrl.searchParams.get("limit")).toBe("3");
      expect(init).toEqual({});
      expect(timeoutMs).toBe(5000);
    }
  });

  it("honors the configured per-tag limit even when Last.fm returns a larger page", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      jsonResponse({
        tracks: {
          track: [
            { name: "First", artist: { name: "Artist" } },
            { name: "Second", artist: { name: "Artist" } },
          ],
        },
      }),
    );

    const result = await lastfmTagsSource.fetch({ tags: ["rock"], limit: 1 }, null);

    expect(result.candidates).toEqual([{ kind: "search", title: "First", artist: "Artist" }]);
    expect(result.skipped).toBe(0);
    expect(new URL(fetchWithTimeoutMock.mock.calls[0]?.[0] as string).searchParams.get("limit")).toBe("1");
  });

  it("returns an empty page for an empty Last.fm result", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ tracks: { track: [] } }));

    await expect(lastfmTagsSource.fetch({ tags: ["rock"], limit: 50 }, null)).resolves.toEqual({
      candidates: [],
      skipped: 0,
      nextCursor: null,
    });
  });

  it.each([
    ["HTTP failure", () => jsonResponse({ message: "upstream details" }, 503)],
    ["Last.fm API error", () => jsonResponse({ error: 6, message: "invalid method" })],
    ["timeout", () => Promise.reject(new Error("request timed out"))],
  ])("fails the complete source fetch safely on %s", async (_label, response) => {
    fetchWithTimeoutMock.mockImplementationOnce(response);

    await expect(lastfmTagsSource.fetch({ tags: ["rock"], limit: 50 }, null)).rejects.toThrow(
      "Crawler source request failed.",
    );
    expect(deviationMock).toHaveBeenCalledWith({
      component: "LastfmTagCrawler",
      errorCode: "MC-API-0004",
      operation: "tag_top_tracks_fetch",
      outcome: "source_fetch_failed",
    });
    expect(JSON.stringify(deviationMock.mock.calls)).not.toContain("test-key");
    expect(JSON.stringify(deviationMock.mock.calls)).not.toContain("upstream details");
  });
});
