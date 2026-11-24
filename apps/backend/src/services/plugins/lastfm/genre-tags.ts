/**
 * @file Which Last.fm tags name a genre.
 *
 * Last.fm tags are user-generated, so a tag list mixes genres with collection
 * labels, descriptors, nationalities, instruments, platforms, years and
 * decades. Artist genres and the genre browse grid both filter through
 * {@link isGenreTag}.
 */

/**
 * Tags Last.fm users attach that say something other than a genre: a
 * collection label, a descriptor, a nationality, an instrument or a platform.
 */
const NON_GENRE_TAGS = new Set([
  "acoustic",
  "albums i own",
  "all",
  "american",
  "australian",
  "beautiful",
  "best",
  "bookmark",
  "british",
  "canadian",
  "cover",
  "favorite",
  "favorites",
  "favourite",
  "favourites",
  "female vocalists",
  "finnish",
  "french",
  "german",
  "guitar",
  "instrumental",
  "irish",
  "italian",
  "japanese",
  "love",
  "loved",
  "male vocalists",
  "mellow",
  "norwegian",
  "oldies",
  "piano",
  "russian",
  "seen live",
  "soundtrack",
  "spotify",
  "swedish",
  "under 2000 listeners",
]);

/** A four-digit year tag from 1900 to 2099, such as `1995`. */
const YEAR_TAG_PATTERN = /^(?:19|20)\d{2}$/;

/** A two-digit decade tag, such as `80s`, in any case. */
const DECADE_TAG_PATTERN = /^\d{2}s$/i;

/**
 * Whether a Last.fm tag names a genre.
 *
 * @param name - The tag as Last.fm spells it.
 * @param options - `keepDates` keeps year and decade tags, which the genre
 *   browse grid shows on purpose and artist genres leave out. It defaults to
 *   `false`, which refuses them.
 * @returns `true` for a tag that is a genre.
 */
export function isGenreTag(name: string, options: { keepDates?: boolean } = {}): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized || NON_GENRE_TAGS.has(normalized)) return false;
  if (options.keepDates) return true;
  return !YEAR_TAG_PATTERN.test(normalized) && !DECADE_TAG_PATTERN.test(normalized);
}
