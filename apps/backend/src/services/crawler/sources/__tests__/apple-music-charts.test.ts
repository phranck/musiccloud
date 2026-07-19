import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appleMusicFetchMock = vi.hoisted(() => vi.fn());
const assertAppleMusicDeveloperTokenMock = vi.hoisted(() => vi.fn());
const appleMusicAvailableMock = vi.hoisted(() => vi.fn());
const deviationMock = vi.hoisted(() => vi.fn());

vi.mock("../../../plugins/apple-music/adapter.js", () => ({
  appleMusicFetch: (...args: unknown[]) => appleMusicFetchMock(...args),
  assertAppleMusicDeveloperToken: () => assertAppleMusicDeveloperTokenMock(),
  appleMusicAdapter: {
    isAvailable: () => appleMusicAvailableMock(),
    detectUrl: (url: string) => (url.startsWith("https://music.apple.com/") ? "at:1" : null),
  },
}));

vi.mock("../../../../lib/infra/logger.js", () => ({
  log: { deviation: (...args: unknown[]) => deviationMock(...args) },
}));

import { getCrawlerSource } from "../../registry.js";
import { CrawlerSourceConfigurationError } from "../../types.js";
import { appleMusicChartsSource } from "../apple-music-charts.js";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

const validSong = {
  id: "song-1",
  type: "songs",
  attributes: {
    url: "https://music.apple.com/at/song/one/1",
    isrc: "AT1234567890",
  },
};

beforeEach(() => {
  appleMusicFetchMock.mockReset();
  assertAppleMusicDeveloperTokenMock.mockReset();
  appleMusicAvailableMock.mockReset();
  deviationMock.mockReset();
  appleMusicAvailableMock.mockReturnValue(true);
  assertAppleMusicDeveloperTokenMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("appleMusicChartsSource manifest and configuration", () => {
  it("is registered in the static crawler source registry", () => {
    expect(getCrawlerSource("apple-music-charts")).toBe(appleMusicChartsSource);
  });

  it("declares the exact disabled Apple Music Charts defaults", () => {
    expect(appleMusicChartsSource).toMatchObject({
      id: "apple-music-charts",
      displayName: "Apple Music Charts",
      defaultIntervalMinutes: 360,
      defaultEnabled: false,
      defaultConfig: { storefront: "us", chart: "most-played", type: "songs", limit: 100 },
    });
  });

  it("normalizes a configured storefront and fills the constrained defaults", () => {
    expect(appleMusicChartsSource.parseConfig({ storefront: "AT", limit: 12 })).toEqual({
      storefront: "at",
      chart: "most-played",
      type: "songs",
      limit: 12,
    });
  });

  it.each([
    { storefront: "austria" },
    { storefront: "u1" },
    { chart: "top-albums" },
    { type: "albums" },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: "100" },
    { extra: true },
  ])("rejects invalid source configuration %#", (config) => {
    expect(() => appleMusicChartsSource.parseConfig(config)).toThrow(CrawlerSourceConfigurationError);
  });

  it("rejects unavailable or invalid credential profiles without exposing secrets", async () => {
    const config = appleMusicChartsSource.parseConfig({});
    appleMusicAvailableMock.mockReturnValueOnce(false);

    await expect(appleMusicChartsSource.assertAvailable(config)).rejects.toThrow(CrawlerSourceConfigurationError);

    assertAppleMusicDeveloperTokenMock.mockRejectedValueOnce(new Error("Bearer top-secret private-key"));
    let rejection: unknown;
    try {
      await appleMusicChartsSource.assertAvailable(config);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(CrawlerSourceConfigurationError);
    expect((rejection as Error).message).not.toMatch(/apple|token|private|secret/i);
  });
});

describe("appleMusicChartsSource.fetch", () => {
  it("requests the configured storefront chart and emits URL candidates with optional ISRC", async () => {
    appleMusicFetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: {
          songs: [
            {
              chart: "most-played",
              name: "Most Played Songs",
              data: [
                validSong,
                { ...validSong, id: "song-2", attributes: { url: "https://music.apple.com/at/song/two/2" } },
              ],
            },
          ],
        },
      }),
    );

    const result = await appleMusicChartsSource.fetch(
      { storefront: "at", chart: "most-played", type: "songs", limit: 2 },
      null,
    );

    expect(appleMusicFetchMock).toHaveBeenCalledWith("/catalog/at/charts?types=songs&chart=most-played&limit=2");
    expect(result).toEqual({
      candidates: [
        { kind: "url", url: "https://music.apple.com/at/song/one/1", isrc: "AT1234567890" },
        { kind: "url", url: "https://music.apple.com/at/song/two/2", isrc: undefined },
      ],
      skipped: 0,
      nextCursor: null,
    });
  });

  it("drops duplicate URL or ISRC candidates and incomplete song resources", async () => {
    appleMusicFetchMock.mockResolvedValueOnce(
      jsonResponse({
        results: {
          songs: [
            {
              chart: "most-played",
              name: "Most Played Songs",
              data: [
                validSong,
                { ...validSong, id: "duplicate-url" },
                {
                  ...validSong,
                  id: "duplicate-isrc",
                  attributes: { url: "https://music.apple.com/at/song/two/2", isrc: "AT1234567890" },
                },
                { id: "missing-url", type: "songs", attributes: {} },
                { id: "wrong-url", type: "songs", attributes: { url: "https://open.spotify.com/track/nope" } },
              ],
            },
          ],
        },
      }),
    );

    await expect(appleMusicChartsSource.fetch({}, null)).resolves.toEqual({
      candidates: [{ kind: "url", url: "https://music.apple.com/at/song/one/1", isrc: "AT1234567890" }],
      skipped: 4,
      nextCursor: null,
    });
  });

  it.each([
    ["HTTP failure", () => jsonResponse({ message: "Authorization: Bearer top-secret" }, 503)],
    ["timeout", () => Promise.reject(new Error("Bearer top-secret"))],
    ["malformed chart response", () => jsonResponse({ results: { songs: {} } })],
  ])("fails the complete source fetch safely on %s", async (_label, response) => {
    appleMusicFetchMock.mockImplementationOnce(response);

    await expect(appleMusicChartsSource.fetch({}, null)).rejects.toThrow("Crawler source request failed.");
    expect(deviationMock).toHaveBeenCalledWith({
      component: "AppleMusicChartsCrawler",
      errorCode: "MC-API-0004",
      operation: "chart_fetch",
      outcome: "source_fetch_failed",
    });
    expect(JSON.stringify(deviationMock.mock.calls)).not.toContain("top-secret");
  });
});
