/**
 * @file Crawler-source contract.
 *
 * A crawler source is anything that can produce a list of track candidates
 * on demand: Deezer charts, Last.fm tag tops, Apple Music charts. Each
 * source is registered in `services/crawler/registry.ts` (build-time
 * static array, not runtime registration) and ticked by the heartbeat
 * when its `crawl_state.next_run_at` falls due.
 *
 * `Candidate` is the union of the two ingest shapes the resolver supports:
 * URL-based (Deezer, Apple Music — both expose ISRC alongside the URL) and
 * search-based (Last.fm — `tag.getTopTracks` returns title + artist with
 * neither ISRC nor MBID, so the resolver does the cross-service identity
 * work from the strings).
 */

export type Candidate = { kind: "url"; url: string; isrc?: string } | { kind: "search"; title: string; artist: string };

export interface CrawlerSourceFetchResult {
  candidates: Candidate[];
  /** Source-level drops such as malformed upstream rows or duplicate search
   * candidates. The heartbeat includes these in the run's skipped counter. */
  skipped?: number;
  /** Opaque per-source pagination state. `null` for sources that always
   *  refetch the full chart (Deezer, Last.fm, Apple Music in this MVP). */
  nextCursor: unknown | null;
}

/** Safe, source-owned validation failure. Its message is suitable for the
 * canonical admin error envelope and crawler run notes, so it must never
 * contain configuration values, credential names, or credential values. */
export class CrawlerSourceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlerSourceConfigurationError";
  }
}

/**
 * Static metadata + runtime fetch behaviour of one crawler source. Each
 * concrete source exports a single `CrawlerSource` object, which gets added
 * to the `SOURCES` array in `crawler/registry.ts`.
 */
export interface CrawlerSource {
  /** Stable identifier — matches the `crawl_state.source` primary key. */
  id: string;
  /** Human-readable name shown in admin UI / logs. */
  displayName: string;
  /** Default schedule in minutes. Operator can override per row at runtime. */
  defaultIntervalMinutes: number;
  /** Initial config payload written into `crawl_state.config` on first seed. */
  defaultConfig: Record<string, unknown>;
  /** Whether the source ticks on a fresh install. Operator can flip later. */
  defaultEnabled: boolean;
  /** Normalizes and validates source-owned persisted JSON before use. */
  parseConfig(config: unknown): Record<string, unknown>;
  /** Verifies source-specific runtime prerequisites without exposing secrets. */
  assertAvailable(config: Record<string, unknown>): void | Promise<void>;
  /**
   * Fetch one page of candidates. The heartbeat passes the live `config`
   * and `cursor` from `crawl_state`; the implementation returns the
   * candidates plus the next cursor (or `null` to restart from scratch).
   */
  fetch(config: Record<string, unknown>, cursor: unknown | null): Promise<CrawlerSourceFetchResult>;
}

/** Shared execution gate for admin enable/run-now paths and the heartbeat. */
export async function validateCrawlerSourceExecution(
  source: CrawlerSource,
  config: unknown,
): Promise<Record<string, unknown>> {
  const normalizedConfig = source.parseConfig(config);
  await source.assertAvailable(normalizedConfig);
  return normalizedConfig;
}
