/**
 * @file Reads the band out of a release title on a Bandcamp account that
 * publishes other artists' releases under its own name.
 *
 * Some labels publish their bands on the label's own Bandcamp account and
 * name each release `Band - Title`. Every structured field on such a page
 * names the label as the artist, so without this the release resolves under
 * the label and no other service finds it. Bandcamp marks no account as a
 * label, so the account is recognised by how it names its releases: nearly
 * all of them name another artist that way. A band's own release with ` - `
 * in its title keeps its title, because a band names few releases like that.
 */
import { log } from "../../../lib/infra/logger";
import {
  BANDCAMP_ERROR_CODE,
  BANDCAMP_LOG_COMPONENT,
  BANDCAMP_REQUEST_TIMEOUT_MS,
  bandcampTransport,
} from "./transport.js";

/** The code point of the en dash, which some titles use between band and title. */
const EN_DASH_CODE_POINT = 0x2013;

/** The code point of the em dash, which some titles use between band and title. */
const EM_DASH_CODE_POINT = 0x2014;

/**
 * A release title of the form `Band - Title`. The separator is a hyphen, an
 * en dash or an em dash with whitespace on both sides, and the band is the
 * part before the first one.
 */
const CREDITED_TITLE_PATTERN = new RegExp(
  `^(.+?)\\s+[-${String.fromCodePoint(EN_DASH_CODE_POINT, EM_DASH_CODE_POINT)}]\\s+(.+)$`,
);

/**
 * The fewest releases an account needs before its naming counts, 5. Below
 * that a single `Band - Title` release would decide it.
 */
export const MIN_ACCOUNT_RELEASES = 5;

/**
 * The share of an account's releases, from 0 to 1, that must name another
 * artist as `Band - Title` for the account to count as publishing other
 * artists. 0.8, because such a label names all of them that way while a band
 * or a label that credits its bands properly stays far below it.
 */
export const MIN_CREDITED_SHARE = 0.8;

/** Bandcamp's app endpoint that lists an account's releases. It takes `{"band_id": <id>}` by POST. */
const BAND_DETAILS_URL = "https://bandcamp.com/api/mobile/24/band_details";

/** A release's band and title, read from a `Band - Title` release title. */
export interface CreditedTitle {
  /** The band the title names. */
  artist: string;
  /** The title without the band. */
  title: string;
}

/** The account that publishes a page, read from the page's `data-band`. */
export interface BandcampAccount {
  /** The account's numeric id, which `band_details` takes. */
  id: number;
  /** The account's name, which a label's page also gives as every release's artist. */
  name: string;
}

/** The part of Bandcamp's `band_details` answer this module reads. */
interface BandDetails {
  discography?: Array<{ title?: string }>;
}

/**
 * Compares two artist names the way Bandcamp's own spellings vary, ignoring
 * case and surrounding whitespace.
 *
 * @param first - One name.
 * @param second - The other name.
 * @returns `true` when both name the same artist.
 */
function sameName(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

/**
 * Splits a `Band - Title` release title when the band it names is not the
 * account itself.
 *
 * @param title - A release title.
 * @param accountName - The name of the Bandcamp account that publishes it.
 * @returns The band and the title, or `null` when the title has no such form
 *   or names the account itself.
 */
export function splitCreditedTitle(title: string, accountName: string): CreditedTitle | null {
  const match = CREDITED_TITLE_PATTERN.exec(title.trim());
  const artist = match?.[1]?.trim();
  const rest = match?.[2]?.trim();
  if (!artist || !rest || sameName(artist, accountName)) return null;
  return { artist, title: rest };
}

/**
 * Says whether an account publishes other artists' releases under its own
 * name, judged by its release titles.
 *
 * @param releaseTitles - The titles of the account's releases.
 * @param accountName - The account's name.
 * @returns `true` when the account has at least {@link MIN_ACCOUNT_RELEASES}
 *   releases and at least {@link MIN_CREDITED_SHARE} of them name another
 *   artist as `Band - Title`.
 */
export function publishesOtherArtists(releaseTitles: readonly string[], accountName: string): boolean {
  if (releaseTitles.length < MIN_ACCOUNT_RELEASES) return false;
  const credited = releaseTitles.filter((title) => splitCreditedTitle(title, accountName) !== null).length;
  return credited / releaseTitles.length >= MIN_CREDITED_SHARE;
}

/**
 * Reads the titles of an account's releases from Bandcamp's app endpoint.
 *
 * @param bandId - The account's numeric id, from the page's `data-band`.
 * @returns The titles, or `null` when Bandcamp did not answer with a
 *   discography. The failure is logged, and the caller keeps the page's data.
 */
async function fetchReleaseTitles(bandId: number): Promise<string[] | null> {
  try {
    const response = await bandcampTransport.request(
      BAND_DETAILS_URL,
      BANDCAMP_REQUEST_TIMEOUT_MS,
      JSON.stringify({ band_id: bandId }),
    );
    if (!response.ok) throw new Error(`band_details answered ${response.status}`);
    const details = (await response.json()) as BandDetails;
    if (!Array.isArray(details.discography)) throw new Error("band_details answered without a discography");
    return details.discography.map((release) => release.title ?? "");
  } catch (error) {
    log.deviation(
      {
        component: BANDCAMP_LOG_COMPONENT,
        errorCode: BANDCAMP_ERROR_CODE,
        operation: "bandcamp_account_releases",
        outcome: "page_artist_kept",
        bandId,
      },
      error,
    );
    return null;
  }
}

/**
 * Finds the band a release belongs to when the account that publishes it
 * names its bands only in the release titles.
 *
 * Only a release whose page names the account itself as the artist is
 * considered, and only a title of the form `Band - Title` costs the account
 * lookup.
 *
 * @param releaseTitle - The title of the release, or of the album a track is on.
 * @param pageArtist - The artist the page names.
 * @param account - The account that publishes the page, or `null` when the page has no `data-band`.
 * @returns The band and the title without it, or `null` when the page's data stands.
 */
export async function creditedRelease(
  releaseTitle: string | undefined,
  pageArtist: string | undefined,
  account: BandcampAccount | null,
): Promise<CreditedTitle | null> {
  if (!releaseTitle || !pageArtist || !account || !sameName(pageArtist, account.name)) return null;
  const credit = splitCreditedTitle(releaseTitle, account.name);
  if (!credit) return null;
  const releaseTitles = await fetchReleaseTitles(account.id);
  return releaseTitles && publishesOtherArtists(releaseTitles, account.name) ? credit : null;
}
