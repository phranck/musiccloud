/**
 * @file List helpers the genre search uses to merge the per-genre result lists.
 */

/**
 * Merges several lists round-robin: first every list's first item, then every
 * list's second item, and so on. Shorter lists simply run out earlier.
 *
 * @param lists - The lists to merge, in priority order within each round.
 * @returns One list holding every item of every input list.
 */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const maxLen = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < maxLen; index++) {
    for (const list of lists) {
      if (index < list.length) out.push(list[index]);
    }
  }
  return out;
}

/**
 * Removes items whose key was already seen, keeping the first occurrence and
 * the original order.
 *
 * @param items - The items to filter.
 * @param key - Maps an item to the identity used for the comparison.
 * @returns The items with unique keys.
 */
export function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (!seen.has(itemKey)) {
      seen.add(itemKey);
      out.push(item);
    }
  }
  return out;
}
