/**
 * @file The one place that percent-encodes and decodes text for a URL path,
 * including text whose encoding may be broken.
 *
 * `decodeURIComponent` throws a `URIError` on a lone `%` or a truncated escape
 * such as `%E0%A4%A`. Every caller that reads a path or a link from outside
 * has to decide what that means for it, so this module answers only whether
 * the text decodes and leaves the decision to the caller.
 *
 * A form path segment writes a space as `+` and a literal plus sign as `%2B`,
 * the way Last.fm writes its links and the way the site writes a genre tile's
 * address. {@link encodeFormPathSegment} and {@link decodeFormPathSegment} are
 * the two directions of that one rule.
 */

/** How `encodeURIComponent` writes a space. */
const PERCENT_ENCODED_SPACE_RE = /%20/g;

/** Every `+` in a form path segment, each of which stands for a space. */
const FORM_ENCODED_SPACE_RE = /\+/g;

/** How a form path segment writes a space. */
const FORM_ENCODED_SPACE = "+";

/** A space, which is what {@link FORM_ENCODED_SPACE} decodes to. */
const SPACE = " ";

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

/**
 * Writes text as one form path segment: percent-encoded, with every space as
 * `+` and every literal plus sign as `%2B`.
 *
 * A path that holds both a `%20` and a reserved escape such as `%26` is
 * refused by Astro, which decodes the request path with `decodeURI` and
 * rejects a path that still holds an escape after decoding something. Written
 * this way, a segment such as `drum+%26+bass` gives `decodeURI` nothing to
 * decode, so Astro routes it and hands the segment on unchanged.
 *
 * @param text - The plain text, such as the genre key `drum & bass`.
 * @returns The segment, such as `drum+%26+bass`. It contains no `/`, so it
 *   stays one segment. {@link decodeFormPathSegment} turns it back into
 *   `text`.
 */
export function encodeFormPathSegment(text: string): string {
  return encodeURIComponent(text).replace(PERCENT_ENCODED_SPACE_RE, FORM_ENCODED_SPACE);
}

/**
 * Reads one form path segment back as plain text: every `+` as a space, then
 * percent-decoded, so `%2B` becomes a literal plus sign.
 *
 * @param segment - The segment, such as `drum+%26+bass`, `c%2B%2B` or a
 *   Last.fm link segment such as `Daft+Punk`.
 * @returns The plain text, such as `drum & bass`, `c++` or `Daft Punk`, or
 *   `null` when the segment holds a broken percent escape such as `100%` or
 *   `%E0%A4%A`, as {@link tryDecodeURIComponent} reports it.
 */
export function decodeFormPathSegment(segment: string): string | null {
  return tryDecodeURIComponent(segment.replace(FORM_ENCODED_SPACE_RE, SPACE));
}
