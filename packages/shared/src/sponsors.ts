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

import { DAY_PATTERN, FundingWindowDays, isCalendarDay } from "./donations.js";

/** Bounds on every field of a sponsor. The request schema and the dashboard's inputs read them. */
export const SPONSOR_LIMITS = {
  /** Longest name: 160 characters, the same as a donor's name in the ledger. */
  nameMaxLength: 160,
  /** Most profile addresses one sponsor may give: 8. */
  linksMaxCount: 8,
  /** Longest profile address: 500 characters. */
  linkMaxLength: 500,
  /** Longest sentence of the sponsor's own: 600 characters. */
  claimMaxLength: 600,
} as const;

/**
 * How many days a sponsorship stands: the funding year, 365 days, so the
 * sponsors on the wall and the covered amount beside them describe the same
 * period.
 */
export const SPONSOR_YEAR_DAYS = FundingWindowDays.Year;

/** The only scheme a profile address may use: `https:`. */
const SPONSOR_LINK_PROTOCOL = "https:";

/**
 * Everything an operator records about one sponsor.
 *
 * @property name - The name as the person gave it, 1 to {@link SPONSOR_LIMITS.nameMaxLength} characters.
 *   One field, so an alias and a full name are entered the same way.
 * @property links - Where they can be found, as profile addresses in the order they gave them,
 *   at most {@link SPONSOR_LIMITS.linksMaxCount}. Each passes {@link isSponsorLink}. Empty for none.
 * @property claim - Their own sentence about why they did it. Empty for none.
 * @property published - Whether they agreed to be named on the site. What they gave counts
 *   towards the year either way. `false` until the operator records their consent.
 * @property paidOn - The day they paid, `YYYY-MM-DD`, which starts their year.
 */
export interface SponsorInput {
  name: string;
  links: string[];
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
 * The request schema of a sponsor, for the backend route.
 *
 * Built from {@link SPONSOR_LIMITS}, so the route and the dashboard agree on
 * what a sponsor may be. The pattern only admits an `https` address; whether
 * it parses, and whether the day exists, is checked in code by
 * {@link isSponsorInputValid}, because a pattern can tell neither.
 */
export const SPONSOR_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "links", "claim", "published", "paidOn"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: SPONSOR_LIMITS.nameMaxLength },
    links: {
      type: "array",
      maxItems: SPONSOR_LIMITS.linksMaxCount,
      items: { type: "string", maxLength: SPONSOR_LIMITS.linkMaxLength, pattern: "^https://\\S+$" },
    },
    claim: { type: "string", maxLength: SPONSOR_LIMITS.claimMaxLength },
    published: { type: "boolean" },
    paidOn: { type: "string", pattern: DAY_PATTERN },
  },
} as const;

/**
 * Checks that a profile address is one the site may link to and the server
 * may look a picture up at.
 *
 * @param value - The address as typed.
 * @returns `true` for an `https` address that parses, has a host and carries
 *   no user name or password; `false` otherwise.
 */
export function isSponsorLink(value: string): boolean {
  if (value.length > SPONSOR_LIMITS.linkMaxLength || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === SPONSOR_LINK_PROTOCOL && url.hostname !== "" && !url.username && !url.password;
}

/**
 * Checks what {@link SPONSOR_INPUT_SCHEMA} cannot: that every profile address
 * parses as {@link isSponsorLink} requires, and that the day paid exists.
 *
 * @param input - A sponsor that already passed the request schema.
 * @returns `true` when the sponsor may be stored.
 */
export function isSponsorInputValid(input: SponsorInput): boolean {
  return input.name.trim() !== "" && input.links.every(isSponsorLink) && isCalendarDay(input.paidOn);
}

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

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
