/**
 * @file The one place that decodes percent-encoded text whose encoding may be
 * broken.
 *
 * `decodeURIComponent` throws a `URIError` on a lone `%` or a truncated escape
 * such as `%E0%A4%A`. Every caller that reads a path or a link from outside
 * has to decide what that means for it, so this module answers only whether
 * the text decodes and leaves the decision to the caller.
 */

/**
 * Decodes percent-encoded text, or reports that its encoding is broken.
 *
 * @param value - The text to decode, such as a path segment or a route
 *   parameter.
 * @returns The decoded text, or `null` when `value` holds a `%` that does not
 *   start a valid escape, such as `100%` or `%E0%A4%A`, which
 *   `decodeURIComponent` rejects with a `URIError`.
 * @throws Whatever `decodeURIComponent` throws that is not a `URIError`.
 */
export function tryDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}
