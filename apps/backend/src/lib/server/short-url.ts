/**
 * @file The public URL of a share page.
 *
 * Every resolve response and every share page's OG metadata points at a share
 * through this one shape, so a share link looks the same wherever it is built.
 */

/**
 * Builds the public URL of the share page for a share id.
 *
 * @param origin - The public origin, such as `https://musiccloud.io`, without a
 *   trailing slash.
 * @param shortId - The share id as the repository minted it.
 * @returns `origin` and `shortId` joined by one slash.
 */
export function shortUrlFor(origin: string, shortId: string): string {
  return `${origin}/${shortId}`;
}
