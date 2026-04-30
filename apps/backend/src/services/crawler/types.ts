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
  /** Opaque per-source pagination state. `null` for sources that always
   *  refetch the full chart (Deezer, Last.fm, Apple Music in this MVP). */
  nextCursor: unknown | null;
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
  /**
   * Fetch one page of candidates. The heartbeat passes the live `config`
   * and `cursor` from `crawl_state`; the implementation returns the
   * candidates plus the next cursor (or `null` to restart from scratch).
   */
  fetch(config: Record<string, unknown>, cursor: unknown | null): Promise<CrawlerSourceFetchResult>;
}
