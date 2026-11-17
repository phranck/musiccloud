/**
 * @file Annual sponsors: the people who carry a year of musiccloud's running
 * costs.
 *
 * A sponsor's year runs from the day they paid, not from the first of January,
 * so the sponsors on the site are simply everybody whose year has not run out.
 * Nothing rolls over and nothing has to be archived: a sponsor drops out on
 * their own anniversary.
 *
 * What a sponsor gave is never stored on the sponsor. It is summed from the
 * donations linked to them, because the donations ledger is the only place a
 * payment is recorded.
 */

import { DAY_MS, DAY_PATTERN, FundingWindowDays, isCalendarDay } from "./donations.js";
import { normalizeSocialMediaLinks, SOCIAL_MEDIA_LINK_SCHEMA, type SocialMediaLinks } from "./social-media.js";

/** Bounds on every field of a sponsor. The request schema and the dashboard's inputs read them. */
export const SPONSOR_LIMITS = {
  /** Longest name: 160 characters, the same as a donor's name in the ledger. */
  nameMaxLength: 160,
  /** Most profile addresses one sponsor may give: 8. */
  socialMediaMaxCount: 8,
  /** Longest sentence of the sponsor's own: 600 characters, as lmaa allows. */
  claimMaxLength: 600,
} as const;

/**
 * How many days a sponsorship stands: the funding year, 365 days, so the
 * sponsors on the wall and the covered amount beside them describe the same
 * period.
 */
export const SPONSOR_YEAR_DAYS = FundingWindowDays.Year;

/**
 * The pattern of a sponsor avatar's id: the SHA-256 of its PNG bytes, as 64
 * lowercase hex digits. The id is the picture's address, so a path segment
 * holding anything else names no picture.
 */
export const SPONSOR_AVATAR_ID_PATTERN = "^[0-9a-f]{64}$";

/** The JSON schema of a sponsor avatar's id, for a route's `params` or a body field. */
export const SPONSOR_AVATAR_ID_SCHEMA = { type: "string", pattern: SPONSOR_AVATAR_ID_PATTERN } as const;

/**
 * Everything an operator records about one sponsor.
 *
 * @property name - The name as the person gave it, 1 to {@link SPONSOR_LIMITS.nameMaxLength} characters.
 *   One field, so an alias and a full name are entered the same way.
 * @property socialMedia - Where they can be found, as a platform and an address each, in the
 *   order they gave them and normalized as `normalizeSocialMediaLinks` does, at most
 *   {@link SPONSOR_LIMITS.socialMediaMaxCount}. Empty for none. The avatar lookup and the
 *   wall's icons read the platform.
 * @property avatarId - Their picture, as the id of the copy musiccloud stored, or `null` for none,
 *   in which case the site shows their initial. Set from what the avatar route answered.
 * @property claim - Their own sentence about why they did it. Empty for none.
 * @property published - Whether they agreed to be named on the site. What they gave counts
 *   towards the year either way. `false` until the operator records their consent.
 * @property paidOn - The day they paid, `YYYY-MM-DD`, which starts their year.
 */
export interface SponsorInput {
  name: string;
  socialMedia: SocialMediaLinks;
  avatarId: string | null;
  claim: string;
  published: boolean;
  paidOn: string;
}

/**
 * One sponsor as stored and read back.
 *
 * @property id - The row's identifier, a nanoid.
 * @property amountCents - What they gave, summed from the donations linked to them. Zero
 *   until a donation is linked. Read only, and never shown on the site, because an amount
 *   beside a name turns a list of people into a ranking.
 * @property createdAt - When the row was written, ISO 8601.
 * @property updatedAt - When the row was last changed, ISO 8601.
 */
export interface Sponsor extends SponsorInput {
  id: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One sponsor as the site shows them: everything on their card and nothing
 * else. No amount, because an amount beside a name turns a list of people
 * into a ranking, and no consent flag, because only those who gave it are here.
 */
export type PublicSponsor = Pick<Sponsor, "id" | "name" | "socialMedia" | "avatarId" | "claim" | "paidOn">;

/**
 * What the public sponsors route answers, ported from lmaa.space's
 * `SponsorsPayload` without its review costs, which musiccloud does not have.
 *
 * @property sponsors - The published sponsors whose year still runs, the earliest payment first.
 * @property costsTotalCents - The year's running costs, the sum of every cost item.
 * @property coveredCents - What came in over the last {@link SPONSOR_YEAR_DAYS} days, from
 *   every route and every donor, uncapped. `fundingProgress` caps it at the costs.
 * @property donatedMonthCents - What came in over the last month's window.
 * @property minAmountCents - What a sponsor gives at least to be named for a year.
 */
export interface SponsorsPayload {
  sponsors: PublicSponsor[];
  costsTotalCents: number;
  coveredCents: number;
  donatedMonthCents: number;
  minAmountCents: number;
}

/**
 * The request schema of a sponsor, for the backend route.
 *
 * Built from {@link SPONSOR_LIMITS}, so the route and the dashboard agree on
 * what a sponsor may be. Whether each address fits its platform, and whether
 * the day exists, is checked in code by {@link normalizeSponsorInput},
 * because a schema can tell neither.
 */
export const SPONSOR_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "socialMedia", "avatarId", "claim", "published", "paidOn"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: SPONSOR_LIMITS.nameMaxLength },
    socialMedia: { type: "array", maxItems: SPONSOR_LIMITS.socialMediaMaxCount, items: SOCIAL_MEDIA_LINK_SCHEMA },
    avatarId: { anyOf: [SPONSOR_AVATAR_ID_SCHEMA, { type: "null" }] },
    claim: { type: "string", maxLength: SPONSOR_LIMITS.claimMaxLength },
    published: { type: "boolean" },
    paidOn: { type: "string", pattern: DAY_PATTERN },
  },
} as const;

/**
 * The request schema of the avatar route: the profiles to find a picture
 * behind, as the sponsor card holds them, saved or not.
 */
export const SPONSOR_AVATAR_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["socialMedia"],
  properties: {
    socialMedia: { type: "array", maxItems: SPONSOR_LIMITS.socialMediaMaxCount, items: SOCIAL_MEDIA_LINK_SCHEMA },
  },
} as const;

/**
 * What the avatar route answers.
 *
 * @property avatarId - The id of the stored copy, or `null` when no profile led to a picture
 *   that could be read.
 */
export interface SponsorAvatarResult {
  avatarId: string | null;
}

/**
 * Brings a sponsor that passed {@link SPONSOR_INPUT_SCHEMA} into the form it
 * is stored in, or refuses it.
 *
 * Name and sentence are trimmed and every address is normalized for its
 * platform, so a pasted address is stored canonically rather than as written.
 *
 * @param input - A sponsor that already passed the request schema.
 * @returns The sponsor to store, or `null` when the name is blank, an address
 *   does not fit its platform, or the day paid does not exist.
 */
export function normalizeSponsorInput(input: SponsorInput): SponsorInput | null {
  const name = input.name.trim();
  const { links, rejected } = normalizeSocialMediaLinks(input.socialMedia);
  if (name === "" || rejected.length > 0 || !isCalendarDay(input.paidOn)) return null;
  return { ...input, name, socialMedia: links, claim: input.claim.trim() };
}

/**
 * How many days of a sponsorship are left.
 *
 * The day paid is day one of {@link SPONSOR_YEAR_DAYS}, so a sponsor who paid
 * today has 365 days left, and one who paid 365 days ago has none and is no
 * longer shown. That is the same window `fundingWindowStart` counts the
 * covered amount over.
 *
 * @param paidOn - The day paid, `YYYY-MM-DD`.
 * @param today - The current day, `YYYY-MM-DD`.
 * @returns Days left, from {@link SPONSOR_YEAR_DAYS} down to zero. Zero for a
 *   day that does not parse. A day in the future counts as paid today.
 */
export function sponsorDaysLeft(paidOn: string, today: string): number {
  const paid = Date.parse(`${paidOn}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(paid) || Number.isNaN(now)) return 0;
  const used = Math.max(Math.floor((now - paid) / DAY_MS), 0);
  return Math.max(SPONSOR_YEAR_DAYS - used, 0);
}
