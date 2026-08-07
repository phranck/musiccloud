import { nanoid } from "nanoid";

/**
 * Generates an internal entity id.
 *
 * Never appears in a URL, so it is sized for uniqueness alone: 21 characters
 * over nanoid's 64-character alphabet are 126 bits.
 *
 * @returns A 21-character id.
 */
export function generateTrackId(): string {
  return nanoid(21);
}

/**
 * Length of a public short id, in characters.
 *
 * Over nanoid's 64-character alphabet this is 48 bits, so roughly 2.8e14
 * values. By the birthday bound the chance of any collision reaches 50 per cent
 * at about 19.8 million allocated ids. A length of five gives 30 bits and
 * reaches the same point at about 38,600, which is a volume this product
 * passes.
 *
 * Length alone is not what makes allocation correct. `mintShortUrl` in
 * `../db/adapters/short-url.ts` reads back what the database stored and retries
 * on a collision, and that holds at any length. This value only decides how
 * rarely the retry is needed, and how hard an id is to guess.
 *
 * Ids already issued at other lengths keep resolving: the route schema accepts
 * one to sixty-four characters of `[A-Za-z0-9_-]`, and lookups match the stored
 * value exactly.
 */
const SHORT_ID_LENGTH = 8;

/**
 * Generates a candidate public short id for a share URL.
 *
 * The value is a candidate, not an allocation. Write it through `mintShortUrl`,
 * which resolves collisions and returns the id the database actually holds.
 *
 * @returns A {@link SHORT_ID_LENGTH}-character id.
 */
export function generateShortId(): string {
  return nanoid(SHORT_ID_LENGTH);
}
