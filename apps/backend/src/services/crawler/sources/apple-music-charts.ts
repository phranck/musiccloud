/**
 * @file Crawler source: Apple Music Charts.
 *
 * Uses the Apple Music adapter's single authenticated request boundary. The
 * source owns only its persisted configuration, chart-response validation,
 * and in-page candidate filtering; the heartbeat retains lock, accounting,
 * shared dedupe, persistence, and auto-disable ownership.
 */
import { log } from "../../../lib/infra/logger.js";
import {
  appleMusicAdapter,
  appleMusicFetch,
  assertAppleMusicDeveloperToken,
} from "../../plugins/apple-music/adapter.js";
import {
  type Candidate,
  type CrawlerSource,
  CrawlerSourceConfigurationError,
  type CrawlerSourceFetchResult,
} from "../types.js";

interface AppleMusicChartsConfig extends Record<string, unknown> {
  storefront: string;
  chart: "most-played";
  type: "songs";
  limit: number;
}

const DEFAULT_CONFIG: AppleMusicChartsConfig = {
  storefront: "us",
  chart: "most-played",
  type: "songs",
  limit: 100,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidConfiguration(): never {
  throw new CrawlerSourceConfigurationError("Crawler source configuration is invalid.");
}

function sourceUnavailable(): never {
  throw new CrawlerSourceConfigurationError("Crawler source is unavailable.");
}

function parseAppleMusicChartsConfig(config: unknown): AppleMusicChartsConfig {
  if (!isRecord(config)) invalidConfiguration();
  if (Object.keys(config).some((key) => key !== "storefront" && key !== "chart" && key !== "type" && key !== "limit")) {
    invalidConfiguration();
  }

  const rawStorefront = config.storefront ?? DEFAULT_CONFIG.storefront;
  const chart = config.chart ?? DEFAULT_CONFIG.chart;
  const type = config.type ?? DEFAULT_CONFIG.type;
  const limit = config.limit ?? DEFAULT_CONFIG.limit;
  if (
    typeof rawStorefront !== "string" ||
    !/^[a-z]{2}$/i.test(rawStorefront) ||
    chart !== "most-played" ||
    type !== "songs" ||
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    invalidConfiguration();
  }

  return { storefront: rawStorefront.toLowerCase(), chart, type, limit };
}

async function assertAppleMusicChartsAvailable(): Promise<void> {
  if (!appleMusicAdapter.isAvailable()) sourceUnavailable();
  try {
    await assertAppleMusicDeveloperToken();
  } catch {
    sourceUnavailable();
  }
}

function chartSongs(payload: unknown): unknown[] {
  if (!isRecord(payload) || !isRecord(payload.results) || !Array.isArray(payload.results.songs)) {
    throw new Error("Apple Music chart response shape is invalid.");
  }
  const bucket = payload.results.songs[0];
  if (!isRecord(bucket) || !Array.isArray(bucket.data)) {
    throw new Error("Apple Music chart response shape is invalid.");
  }
  return bucket.data;
}

function asUrlCandidate(value: unknown): Extract<Candidate, { kind: "url" }> | null {
  if (
    !isRecord(value) ||
    value.type !== "songs" ||
    !isRecord(value.attributes) ||
    typeof value.attributes.url !== "string"
  ) {
    return null;
  }
  const url = value.attributes.url.trim();
  if (!url || appleMusicAdapter.detectUrl(url) === null) return null;
  const rawIsrc = value.attributes.isrc;
  const isrc = typeof rawIsrc === "string" && rawIsrc.trim() ? rawIsrc.trim() : undefined;
  return { kind: "url", url, isrc };
}

export const appleMusicChartsSource: CrawlerSource = {
  id: "apple-music-charts",
  displayName: "Apple Music Charts",
  defaultIntervalMinutes: 360,
  defaultEnabled: false,
  defaultConfig: DEFAULT_CONFIG,
  parseConfig: parseAppleMusicChartsConfig,
  assertAvailable: async () => assertAppleMusicChartsAvailable(),

  async fetch(config: Record<string, unknown>): Promise<CrawlerSourceFetchResult> {
    const parsedConfig = parseAppleMusicChartsConfig(config);
    await assertAppleMusicChartsAvailable();
    const query = new URLSearchParams({
      types: parsedConfig.type,
      chart: parsedConfig.chart,
      limit: String(parsedConfig.limit),
    });

    try {
      const response = await appleMusicFetch(`/catalog/${parsedConfig.storefront}/charts?${query.toString()}`);
      if (!response.ok) throw new Error("Apple Music chart request was not successful.");

      const candidates: Candidate[] = [];
      const seenUrls = new Set<string>();
      const seenIsrcs = new Set<string>();
      let skipped = 0;
      for (const song of chartSongs(await response.json())) {
        const candidate = asUrlCandidate(song);
        if (!candidate || seenUrls.has(candidate.url) || (candidate.isrc && seenIsrcs.has(candidate.isrc))) {
          skipped++;
          continue;
        }
        seenUrls.add(candidate.url);
        if (candidate.isrc) seenIsrcs.add(candidate.isrc);
        candidates.push(candidate);
      }

      return { candidates, skipped, nextCursor: null };
    } catch {
      log.deviation({
        component: "AppleMusicChartsCrawler",
        errorCode: "MC-API-0004",
        operation: "chart_fetch",
        outcome: "source_fetch_failed",
      });
      throw new Error("Crawler source request failed.");
    }
  },
};
