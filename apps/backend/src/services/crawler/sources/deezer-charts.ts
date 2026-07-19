/**
 * @file Crawler source: Deezer Charts.
 *
 * Pulls the per-genre chart top tracks from `https://api.deezer.com/chart/{genreId}/tracks`
 * for a configured set of genre IDs. The endpoint is keyless and returns
 * each track's `link` and `isrc` (verified via Deezer Community Q&A on
 * ISRC support in the public API), so candidates are emitted as
 * `kind: "url"` with the ISRC pre-attached for the dedupe layer.
 *
 * Default genre set: global (0) plus the major Deezer genres
 * (Pop=132, Rap/HipHop=116, Rock=152, Dance=113, Jazz=165,
 * Classical=153, R&B=144, Reggae=75, Country=84, Metal=464).
 * Genre IDs come from `https://api.deezer.com/genre`.
 *
 * Rate limiting: Deezer's public API has no documented throttle but the
 * community-reported ceiling is around ~50 requests per 5 seconds. We
 * sleep 250 ms between genre calls — well under the soft cap and still
 * runs all 11 genres in under 3 seconds per tick.
 */
import {
  type Candidate,
  type CrawlerSource,
  CrawlerSourceConfigurationError,
  type CrawlerSourceFetchResult,
} from "../types.js";

interface DeezerChartTrackResponse {
  data?: Array<{
    link?: string;
    isrc?: string;
  }>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const DEFAULT_CONFIG = {
  genres: [0, 132, 116, 152, 113, 165, 153, 144, 75, 84, 464],
  limit: 100,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDeezerChartsConfig(config: unknown): { genres: number[]; limit: number } {
  if (!isRecord(config)) throw new CrawlerSourceConfigurationError("Crawler source configuration is invalid.");
  if (Object.keys(config).some((key) => key !== "genres" && key !== "limit")) {
    throw new CrawlerSourceConfigurationError("Crawler source configuration is invalid.");
  }

  // Keep the historic direct-fetch fallback. Fresh persisted rows receive
  // DEFAULT_CONFIG during seeding, while an older empty config still means
  // the global chart only.
  const genres = config.genres ?? [0];
  const limit = config.limit ?? DEFAULT_CONFIG.limit;
  if (
    !Array.isArray(genres) ||
    !genres.every((genre) => typeof genre === "number" && Number.isInteger(genre) && genre >= 0) ||
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    throw new CrawlerSourceConfigurationError("Crawler source configuration is invalid.");
  }

  return { genres: [...genres], limit };
}

export const deezerChartsSource: CrawlerSource = {
  id: "deezer-charts",
  displayName: "Deezer Charts",
  defaultIntervalMinutes: 360,
  defaultEnabled: true,
  defaultConfig: DEFAULT_CONFIG,
  parseConfig: parseDeezerChartsConfig,
  assertAvailable: () => undefined,

  async fetch(config: Record<string, unknown>): Promise<CrawlerSourceFetchResult> {
    const { genres, limit } = parseDeezerChartsConfig(config);

    const candidates: Candidate[] = [];
    for (const genreId of genres) {
      const url = `https://api.deezer.com/chart/${genreId}/tracks?limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as DeezerChartTrackResponse;
      for (const track of json.data ?? []) {
        if (track.link) {
          candidates.push({ kind: "url", url: track.link, isrc: track.isrc });
        }
      }
      await sleep(250);
    }

    return { candidates, nextCursor: null };
  },
};
