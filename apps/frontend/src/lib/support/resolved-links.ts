/**
 * @file How many links the reader has resolved on the site, counted in their
 * own browser for the support prompts.
 *
 * This is musiccloud's counterpart of lmaa.space's kept shops, the second
 * counter a prompt's threshold may read. It lives in a store of its own, as
 * lmaa's kept shops do, because it is counted on the landing page whether or
 * not a prompt is on screen, and nothing about it leaves the browser.
 */

/** Where the count lives, in the naming of the other stores on this site. */
export const RESOLVED_LINKS_STORAGE_KEY = "musiccloud:resolved-links:v1";

/**
 * What the site remembers about the links one reader resolved.
 *
 * @property count - How many links the reader has resolved, the same one twice in a row counted once.
 * @property last - The share address of the last one counted, or `null` before the first.
 */
export interface ResolvedLinksStore {
  count: number;
  last: string | null;
}

/**
 * Reads the count back from what was stored, dropping anything unusable.
 *
 * @param raw - What the storage held, or `null` when it held nothing.
 * @returns A store that is safe to use, whatever was in the storage.
 */
export function parseResolvedLinks(raw: string | null): ResolvedLinksStore {
  const store: ResolvedLinksStore = { count: 0, last: null };
  if (!raw) return store;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return store;
  }
  if (typeof parsed !== "object" || parsed === null) return store;

  const candidate = parsed as Partial<ResolvedLinksStore>;
  store.count = Number.isFinite(candidate.count) ? Number(candidate.count) : 0;
  store.last = typeof candidate.last === "string" ? candidate.last : null;
  return store;
}

/**
 * Counts a resolved link, but only when it is a different one.
 *
 * Showing the same result again, after going back or reloading, is not a
 * second resolve, as a reload of a share page is not a second visit.
 *
 * @param store - The store before.
 * @param shareUrl - The share address the resolve led to.
 * @returns The store afterwards, unchanged when the address is the last one.
 */
export function countResolvedLink(store: ResolvedLinksStore, shareUrl: string): ResolvedLinksStore {
  if (store.last === shareUrl) return store;
  return { count: store.count + 1, last: shareUrl };
}

/**
 * Reads how many links this reader has resolved.
 *
 * @returns The count, zero where the browser stores nothing or refuses to.
 */
export function readResolvedLinkCount(): number {
  try {
    return parseResolvedLinks(window.localStorage.getItem(RESOLVED_LINKS_STORAGE_KEY)).count;
  } catch {
    return 0;
  }
}

/**
 * Counts a resolve in this reader's browser.
 *
 * A browser that refuses to store anything counts nothing, which costs a
 * prompt its threshold rather than costing the page its result.
 *
 * @param shareUrl - The share address the resolve led to.
 */
export function recordResolvedLink(shareUrl: string): void {
  try {
    const store = parseResolvedLinks(window.localStorage.getItem(RESOLVED_LINKS_STORAGE_KEY));
    const next = countResolvedLink(store, shareUrl);
    if (next !== store) window.localStorage.setItem(RESOLVED_LINKS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: nothing is counted, and the result shows as ever.
  }
}
