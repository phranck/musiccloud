/**
 * @file JSON-LD extraction for page scraping adapters.
 *
 * Track and album pages embed their structured metadata as an
 * `application/ld+json` script block. Only the first block on a page is read,
 * and it counts only when its `@type` is the one the caller asks for, so a
 * page whose first block describes something else yields nothing.
 */

/**
 * The block form Bandcamp, Melon and Boomplay write: a JSON object directly
 * after a `type` attribute that closes the tag, as in
 * `<script type="application/ld+json">{...}</script>`. Group 1 is the object.
 */
export const JSON_LD_OBJECT_PATTERN = /application\/ld\+json">\s*(\{[\s\S]*?\})\s*<\/script>/i;

/**
 * The block form Pandora writes: any script tag whose `type` attribute names
 * JSON-LD in single or double quotes, wherever the attribute sits in the tag.
 * Group 1 is everything up to the closing tag.
 */
export const JSON_LD_SCRIPT_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i;

/** The schema.org `@type` of a track page's block. */
export const JSON_LD_RECORDING_TYPE = "MusicRecording";

/** The schema.org `@type` of an album page's block. */
export const JSON_LD_ALBUM_TYPE = "MusicAlbum";

/** How {@link readJsonLd} finds the block and reports one it cannot read. */
export interface JsonLdReadOptions {
  /**
   * The block pattern. Its first group captures the JSON text, and it carries
   * no `g` flag, so the first block on the page is the one read. Defaults to
   * {@link JSON_LD_OBJECT_PATTERN}.
   */
  pattern?: RegExp;
  /**
   * Called when the block's text is empty or not JSON, or parses to `null`.
   * Not called when the page has no block or the block has another `@type`.
   * Defaults to no call.
   */
  onInvalid?: (error: unknown) => void;
}

/**
 * Reads the first JSON-LD block of a page when it has the wanted `@type`.
 *
 * @param html - The page.
 * @param type - The schema.org type the block must declare, such as
 *   {@link JSON_LD_RECORDING_TYPE} or {@link JSON_LD_ALBUM_TYPE}.
 * @param options - The block pattern and the invalid-block callback, with the
 *   defaults {@link JsonLdReadOptions} names.
 * @returns The parsed block, typed as the caller's schema shape, or `null`
 *   when the page has no block, the block is not JSON, or its `@type` differs.
 */
export function readJsonLd<T>(html: string, type: string, options: JsonLdReadOptions = {}): T | null {
  const match = (options.pattern ?? JSON_LD_OBJECT_PATTERN).exec(html);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data["@type"] === type ? (data as T) : null;
  } catch (error) {
    options.onInvalid?.(error);
    return null;
  }
}
