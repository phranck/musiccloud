/**
 * Refresh margin of a cache that hands out its value until the very end of
 * its time to live: `0` ms. The default of
 * {@link ExpiringValueCacheOptions.refreshMarginMs}.
 */
export const NO_REFRESH_MARGIN_MS = 0;

/**
 * How one {@link ExpiringValueCache} loads and keeps its value.
 *
 * @typeParam Value - What the cache holds, such as a token string.
 */
export interface ExpiringValueCacheOptions<Value> {
  /**
   * Loads a fresh value. It throws when no value can be had, and the cache
   * then either rethrows or answers the stale value, as
   * {@link keepStaleOnFailure} decides.
   */
  load: () => Promise<Value>;
  /**
   * How long a loaded value stays valid, in milliseconds, counted from the
   * moment `load` resolved. A function receives the loaded value, for a
   * provider that names the lifetime in its answer.
   */
  timeToLiveMs: number | ((value: Value) => number);
  /**
   * How many milliseconds before the end of its time to live a value already
   * counts as stale, so a value is never handed out that expires during the
   * request it is sent with. Defaults to {@link NO_REFRESH_MARGIN_MS}.
   */
  refreshMarginMs?: number;
  /**
   * Whether a failed load answers the value the cache already holds, however
   * old, instead of throwing. `true` answers the old value when there is one
   * and rethrows only when there is none; `false` always rethrows. The old
   * value stays stale either way, so the next call loads again. Defaults to
   * `false`.
   */
  keepStaleOnFailure?: boolean;
}

/**
 * Turns a loader that reports failure as `null` into one that throws, as
 * {@link ExpiringValueCacheOptions.load} expects, so a failed load falls back
 * on the stale value instead of being stored.
 *
 * @param load - Loads the value, answering `null` or an empty string when none can be had.
 * @param what - What was loaded, which the error names.
 * @returns A loader that answers the value and throws in place of an empty answer.
 */
export function throwOnEmpty<Value>(load: () => Promise<Value | null>, what: string): () => Promise<Value> {
  return async () => {
    const value = await load();
    if (value === null || value === "") throw new Error(`${what} could not be loaded`);
    return value;
  };
}

/** A loaded value and the moment, in epoch milliseconds, it turns stale. */
interface CacheEntry<Value> {
  value: Value;
  staleAt: number;
}

/**
 * Holds one credential, or any other value that is expensive to load and
 * valid for a limited time, for every caller in the process.
 *
 * - A value is handed out while `Date.now()` is before the end of its time to
 *   live minus the refresh margin.
 * - Concurrent callers that find no valid value share one load, so a burst of
 *   requests after expiry sends one token request rather than one each.
 *   Upstreams otherwise rate-limit the backend or invalidate earlier tokens.
 * - A failed load stores nothing. With `keepStaleOnFailure` it answers the
 *   value from before.
 *
 * @typeParam Value - What the cache holds.
 */
export class ExpiringValueCache<Value> {
  /** The value last loaded or set, or `null` while there is none. */
  private entry: CacheEntry<Value> | null = null;
  /** The load in flight that concurrent callers share, or `null` while none runs. */
  private pending: Promise<Value> | null = null;

  /**
   * @param options - How the value is loaded and how long it lives.
   */
  constructor(private readonly options: ExpiringValueCacheOptions<Value>) {}

  /**
   * Answers the cached value while it is valid, and otherwise loads a fresh
   * one, sharing a load that is already in flight.
   *
   * @returns The valid value, the freshly loaded one, or after a failed load
   *   with `keepStaleOnFailure` the stale one.
   * @throws Whatever `load` throws, when the cache holds no value to fall back
   *   on or `keepStaleOnFailure` is off.
   */
  get(): Promise<Value> {
    const { entry } = this;
    if (entry && Date.now() < entry.staleAt - (this.options.refreshMarginMs ?? NO_REFRESH_MARGIN_MS)) {
      return Promise.resolve(entry.value);
    }
    if (this.pending) return this.pending;

    this.pending = this.loadAndStore().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /**
   * Stores a value as if `load` had just answered it, with the full time to live.
   *
   * @param value - The value to hand out from now on.
   */
  set(value: Value): void {
    const { timeToLiveMs } = this.options;
    const lifetimeMs = typeof timeToLiveMs === "function" ? timeToLiveMs(value) : timeToLiveMs;
    this.entry = { value, staleAt: Date.now() + lifetimeMs };
  }

  /**
   * Drops the cached value, for a value the provider refused, so the next
   * call loads a fresh one and a failed load has no stale value to answer.
   * A load already in flight keeps running and stores its result.
   */
  invalidate(): void {
    this.entry = null;
  }

  /**
   * Drops the cached value and forgets a load in flight. Tests call it
   * between cases, because the caches are module-level singletons that the
   * cases share. Production code calls {@link invalidate} instead.
   */
  reset(): void {
    this.entry = null;
    this.pending = null;
  }

  /**
   * Runs one load and stores its value.
   *
   * @returns The loaded value, or the stale one after a failure when
   *   `keepStaleOnFailure` is on and a value exists.
   * @throws The load's error otherwise.
   */
  private async loadAndStore(): Promise<Value> {
    let value: Value;
    try {
      value = await this.options.load();
    } catch (error) {
      if (this.options.keepStaleOnFailure && this.entry) return this.entry.value;
      throw error;
    }
    this.set(value);
    return value;
  }
}
