/**
 * @file Crawler source: Last.fm Tag Tops.
 *
 * Fetches a bounded `tag.getTopTracks` page for each configured Last.fm tag.
 * Last.fm supplies artist/title data but no resolvable service URL or stable
 * ID, so this source emits the shared search-candidate shape and lets the
 * existing resolver own canonical identity and persistence.
 */
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";
import {
  type Candidate,
  type CrawlerSource,
  CrawlerSourceConfigurationError,
  type CrawlerSourceFetchResult,
} from "../types.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0";
const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_SPACING_MS = 250;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 100;

interface LastfmTagConfig extends Record<string, unknown> {
  tags: string[];
  limit: number;
}

interface LastfmTagTracksResponse {
  error?: unknown;
  tracks?: {
    track?: unknown;
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function invalidConfiguration(): never {
  throw new CrawlerSourceConfigurationError("Crawler source configuration is invalid.");
}

function parseLastfmTagsConfig(config: unknown): LastfmTagConfig {
  if (!isRecord(config)) invalidConfiguration();
  if (Object.keys(config).some((key) => key !== "tags" && key !== "limit")) invalidConfiguration();

  const rawTags = config.tags ?? [];
  const rawLimit = config.limit ?? DEFAULT_LIMIT;
  if (!Array.isArray(rawTags) || rawTags.length > MAX_TAGS) invalidConfiguration();
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    invalidConfiguration();
  }

  const tags = rawTags.map((tag) => {
    if (typeof tag !== "string") invalidConfiguration();
    const normalized = normalizeWhitespace(tag).toLocaleLowerCase("en-US");
    if (!normalized || normalized.length > MAX_TAG_LENGTH) invalidConfiguration();
    return normalized;
  });
  if (new Set(tags).size !== tags.length) invalidConfiguration();

  return { tags, limit: rawLimit };
}

function assertLastfmTagsAvailable(config: LastfmTagConfig): void {
  if (config.tags.length === 0) {
    throw new CrawlerSourceConfigurationError("Crawler source configuration is incomplete.");
  }
  if (!process.env.LASTFM_API_KEY) {
    throw new CrawlerSourceConfigurationError("Crawler source is unavailable.");
  }
}

function asSearchCandidate(value: unknown): Extract<Candidate, { kind: "search" }> | null {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    !isRecord(value.artist) ||
    typeof value.artist.name !== "string"
  ) {
    return null;
  }
  const title = normalizeWhitespace(value.name);
  const artist = normalizeWhitespace(value.artist.name);
  return title && artist ? { kind: "search", title, artist } : null;
}

function candidateKey(candidate: Extract<Candidate, { kind: "search" }>): string {
  return `${candidate.artist.toLocaleLowerCase("en-US")}\u0000${candidate.title.toLocaleLowerCase("en-US")}`;
}

async function fetchTagTopTracks(tag: string, limit: number, apiKey: string): Promise<unknown[]> {
  const query = new URLSearchParams({
    method: "tag.getTopTracks",
    tag,
    api_key: apiKey,
    format: "json",
    limit: String(limit),
  });

  try {
    const response = await fetchWithTimeout(`${API_BASE}/?${query.toString()}`, {}, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error("Last.fm response was not successful.");
    const payload = (await response.json()) as LastfmTagTracksResponse;
    if (payload.error !== undefined) throw new Error("Last.fm returned an API error.");
    return Array.isArray(payload.tracks?.track) ? payload.tracks.track.slice(0, limit) : [];
  } catch {
    log.deviation({
      component: "LastfmTagCrawler",
      errorCode: "MC-API-0004",
      operation: "tag_top_tracks_fetch",
      outcome: "source_fetch_failed",
    });
    throw new Error("Crawler source request failed.");
  }
}

export const lastfmTagsSource: CrawlerSource = {
  id: "lastfm-tags",
  displayName: "Last.fm Tag Tops",
  defaultIntervalMinutes: 360,
  defaultEnabled: false,
  defaultConfig: { tags: [], limit: DEFAULT_LIMIT },
  parseConfig: (config) => parseLastfmTagsConfig(config),
  assertAvailable: (config) => assertLastfmTagsAvailable(parseLastfmTagsConfig(config)),

  async fetch(config: Record<string, unknown>): Promise<CrawlerSourceFetchResult> {
    const parsedConfig = parseLastfmTagsConfig(config);
    assertLastfmTagsAvailable(parsedConfig);
    const apiKey = process.env.LASTFM_API_KEY as string;
    const candidates: Candidate[] = [];
    const seenCandidates = new Set<string>();
    let skipped = 0;

    for (const [index, tag] of parsedConfig.tags.entries()) {
      const tracks = await fetchTagTopTracks(tag, parsedConfig.limit, apiKey);
      for (const track of tracks) {
        const candidate = asSearchCandidate(track);
        if (!candidate) {
          skipped++;
          continue;
        }
        const key = candidateKey(candidate);
        if (seenCandidates.has(key)) {
          skipped++;
          continue;
        }
        seenCandidates.add(key);
        candidates.push(candidate);
      }
      if (index < parsedConfig.tags.length - 1) await sleep(REQUEST_SPACING_MS);
    }

    return { candidates, skipped, nextCursor: null };
  },
};
