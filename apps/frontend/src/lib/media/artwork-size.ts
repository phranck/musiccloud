/**
 * Edge length list rows request artwork at, in pixels. A row shows its cover at
 * up to 64 CSS pixels, 128 at double density, and a selected row's spinning
 * record shows it on a smaller label, so 250 covers both with room. It is also
 * Deezer's own medium cover size.
 */
export const THUMBNAIL_ARTWORK_PX = 250;

/** A Deezer cover or artist picture, whose size is a path segment. */
const DEEZER_IMAGE_SIZE = /(\/images\/(?:cover|artist)\/[0-9a-f]+\/)\d+x\d+(-)/;

/** An Apple Music artwork URL, whose size is the file name. */
const APPLE_ARTWORK_SIZE = /(mzstatic\.com\/.+\/)\d+x\d+(bb\.(?:jpg|png|webp))$/;

/**
 * Asks a CDN for an artwork at the given edge length where the URL itself
 * carries the size, which Deezer and Apple Music do. The services send their
 * largest artwork, 1000 pixels for Deezer, and decoding eight of those for a
 * list of 48-pixel thumbnails is what dropped frames when a candidate list
 * appeared. Any other URL is returned unchanged, so an unknown CDN still shows
 * its full-size image.
 *
 * @param url - Artwork URL as the backend sent it, or nothing.
 * @param px - Edge length to request, in pixels.
 * @returns The resized URL, the original URL, or `undefined` when none was given.
 */
export function artworkUrlAtSize(url: string | undefined, px: number): string | undefined {
  if (!url) return url;
  if (DEEZER_IMAGE_SIZE.test(url)) return url.replace(DEEZER_IMAGE_SIZE, `$1${px}x${px}$2`);
  if (APPLE_ARTWORK_SIZE.test(url)) return url.replace(APPLE_ARTWORK_SIZE, `$1${px}x${px}$2`);
  return url;
}
