/**
 * @file What somebody says about themselves before they pay for a sponsorship,
 * and the reference their transfer carries back to it.
 *
 * Ported from lmaa.space (`packages/contracts/src/pending-sponsorships.ts`).
 * A SEPA transfer carries either a sentence or a reference, and everything here
 * is more than a sentence could hold and less certain to survive one, so it is
 * said on the site and the payment carries only an ISO 11649 reference pointing
 * back at it. musiccloud validates with JSON schema rather than Zod, and opens
 * its references with {@link SPONSORSHIP_REFERENCE_TAG} rather than lmaa's
 * `SPON`, so if both projects ever read one account, neither takes the other's
 * sponsor for its own.
 */

import { buildCreditorReference, normalizeCreditorReference, randomReferenceBody } from "./creditor-reference.js";
import { DAY_MS, DAY_PATTERN } from "./donations.js";
import { classifyProfileLink, type SocialMediaLinks } from "./social-media/index.js";

/**
 * The four characters every musiccloud sponsorship reference opens with after
 * `RF` and the check digits: `MCSP`, for musiccloud sponsorship. A payee reads it
 * on a statement and knows the payment is a sponsorship before looking it up.
 */
export const SPONSORSHIP_REFERENCE_TAG = "MCSP";

/**
 * How many random characters follow the tag: 12. Drawn from a 32-character
 * alphabet, that is 60 bits, so guessing a live reference among the few dozen
 * a year holds is out of reach, and with the tag the body is 16 of the 21
 * characters ISO 11649 allows.
 */
export const SPONSORSHIP_REFERENCE_RANDOM_LENGTH = 12;

/** How long an unclaimed request stands before it is removed, and how long a browser keeps its reference: 60 days. */
export const PENDING_SPONSORSHIP_DAYS = 60;

/**
 * The largest body a request may carry, in bytes: 4,096. Every field at its
 * longest fits several times over, so anything larger is not the form. The
 * public routes and the site's proxy in front of them refuse a larger body
 * with `413` before reading it as JSON.
 */
export const PENDING_SPONSORSHIP_BODY_MAX_BYTES = 4 * 1024;

/** Bounds on every field of a request. The request schema and the form read them. */
export const PENDING_SPONSORSHIP_LIMITS = {
  /** Longest name: 160 characters, as a sponsor's in the dashboard. */
  nameMaxLength: 160,
  /** Longest profile address: 200 characters. */
  linkMaxLength: 200,
  /** Longest sentence: 250 characters, shorter than the dashboard's, as lmaa's form. */
  claimMaxLength: 250,
  /** Highest announced amount: 1,000,000 cents, as a donation's. */
  amountMaxCents: 1_000_000,
  /** Smallest amount a takeover records: 1 cent, because the ledger holds no empty payment. */
  takeoverMinCents: 1,
} as const;

/**
 * The moment before which a request has expired: {@link PENDING_SPONSORSHIP_DAYS}
 * days before `now`. The backend's sweep removes every request made before it,
 * and the dashboard counts the days left against the same rule.
 *
 * @param now - The moment to measure from.
 * @returns The cutoff.
 */
export function pendingSponsorshipCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_SPONSORSHIP_DAYS * DAY_MS);
}

/**
 * How many days a request still stands before the sweep removes it.
 *
 * A started day counts as a day left, so a request made a moment ago has all
 * {@link PENDING_SPONSORSHIP_DAYS} and one with an hour to go has 1.
 *
 * @param createdAt - When the request was made, ISO 8601.
 * @param now - The moment to count from.
 * @returns Days left, from {@link PENDING_SPONSORSHIP_DAYS} down to zero. Zero
 *   once the time has run out, and for a timestamp that does not parse.
 */
export function pendingSponsorshipDaysLeft(createdAt: string, now: Date): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  const left = Math.ceil((created - pendingSponsorshipCutoff(now).getTime()) / DAY_MS);
  return Math.min(Math.max(left, 0), PENDING_SPONSORSHIP_DAYS);
}

/**
 * Everything the form asks of somebody who means to become a sponsor.
 *
 * @property name - The name, as the person gave it, 1 to {@link PENDING_SPONSORSHIP_LIMITS.nameMaxLength}.
 * @property link - Where they can be found, as one address of any kind; which service it
 *   belongs to is worked out from the address, and an address on none of the known ones is a website.
 * @property claim - Their own sentence, 1 to {@link PENDING_SPONSORSHIP_LIMITS.claimMaxLength}.
 * @property amountCents - What they announced, in cents, from 0 to
 *   {@link PENDING_SPONSORSHIP_LIMITS.amountMaxCents}. The statement still decides what arrived.
 * @property published - Whether they want to be named on the site, asked here because a flag a
 *   bank may fold is no record of consent.
 */
export interface PendingSponsorshipInput {
  name: string;
  link: string;
  claim: string;
  amountCents: number;
  published: boolean;
}

/** The request schema of the form, for `POST` and `PUT` of the public route. */
export const PENDING_SPONSORSHIP_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "link", "claim", "amountCents", "published"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: PENDING_SPONSORSHIP_LIMITS.nameMaxLength },
    link: { type: "string", minLength: 1, maxLength: PENDING_SPONSORSHIP_LIMITS.linkMaxLength },
    claim: { type: "string", minLength: 1, maxLength: PENDING_SPONSORSHIP_LIMITS.claimMaxLength },
    amountCents: { type: "integer", minimum: 0, maximum: PENDING_SPONSORSHIP_LIMITS.amountMaxCents },
    published: { type: "boolean" },
  },
} as const;

/**
 * A request as the dashboard lists it.
 *
 * @property id - The row's identifier, a nanoid.
 * @property reference - The reference the transfer carries, without spaces.
 * @property socialMedia - The address, sorted into the service it belongs to, as the list a sponsor carries.
 * @property createdAt - When it was said, ISO 8601, which is what makes the consent a record.
 */
export interface PendingSponsorship extends Omit<PendingSponsorshipInput, "link"> {
  id: string;
  reference: string;
  socialMedia: SocialMediaLinks;
  createdAt: string;
}

/**
 * What the site answers once the form has been taken.
 *
 * @property reference - The reference as it travels, without spaces.
 * @property referenceFormatted - The same reference in groups of four, as it is printed.
 */
export interface PendingSponsorshipReceipt {
  reference: string;
  referenceFormatted: string;
}

/**
 * What the operator supplies to turn a request into a sponsor and a donation.
 * Everything else about the person is in the request; neither of these is,
 * because what arrived and when is read off the statement.
 *
 * @property amountCents - What arrived, in cents.
 * @property paidOn - The day it arrived, `YYYY-MM-DD`, which starts the sponsor's year.
 */
export interface PendingSponsorshipTakeover {
  amountCents: number;
  paidOn: string;
}

/** The request schema of the takeover. */
export const PENDING_SPONSORSHIP_TAKEOVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["amountCents", "paidOn"],
  properties: {
    amountCents: {
      type: "integer",
      minimum: PENDING_SPONSORSHIP_LIMITS.takeoverMinCents,
      maximum: PENDING_SPONSORSHIP_LIMITS.amountMaxCents,
    },
    paidOn: { type: "string", pattern: DAY_PATTERN },
  },
} as const;

/**
 * The pattern of a reference in a path: `RF`, two check digits, the tag and the
 * random characters, as {@link issueSponsorshipReference} draws them.
 */
export const SPONSORSHIP_REFERENCE_PATTERN = `^RF[0-9]{2}${SPONSORSHIP_REFERENCE_TAG}[0-9A-Z]{${SPONSORSHIP_REFERENCE_RANDOM_LENGTH}}$`;

/** The JSON schema of the `:reference` path parameter. */
export const SPONSORSHIP_REFERENCE_PARAMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reference"],
  properties: { reference: { type: "string", pattern: SPONSORSHIP_REFERENCE_PATTERN } },
} as const;

/**
 * Draws a new sponsorship reference.
 *
 * @param randomValues - Fills a buffer of the given size with cryptographically secure bytes,
 *   `crypto.getRandomValues` in the browser or `randomBytes` on the server.
 * @returns The reference, such as `RF12MCSP7Q2K9X4M8T3B`.
 */
export function issueSponsorshipReference(randomValues: (size: number) => Uint8Array): string {
  return buildCreditorReference(
    `${SPONSORSHIP_REFERENCE_TAG}${randomReferenceBody(SPONSORSHIP_REFERENCE_RANDOM_LENGTH, randomValues)}`,
  );
}

/**
 * Reads a reference as it arrived and keeps it only when it is one of ours.
 *
 * @param reference - The reference, spaces and any case allowed.
 * @returns The reference without spaces in upper case, or `null` when its check
 *   digits fail or it does not carry {@link SPONSORSHIP_REFERENCE_TAG}.
 */
export function normalizeSponsorshipReference(reference: string): string | null {
  const normalized = normalizeCreditorReference(reference);
  return normalized && new RegExp(SPONSORSHIP_REFERENCE_PATTERN).test(normalized) ? normalized : null;
}

/**
 * Brings a request that passed {@link PENDING_SPONSORSHIP_INPUT_SCHEMA} into the
 * form it is stored in, or refuses it.
 *
 * @param input - The request.
 * @returns The trimmed fields and the address sorted into its service, or `null`
 *   when a text is blank after trimming or the address is not one a page can link to.
 */
export function normalizePendingSponsorshipInput(
  input: PendingSponsorshipInput,
): (Omit<PendingSponsorshipInput, "link"> & { socialMedia: SocialMediaLinks }) | null {
  const name = input.name.trim();
  const claim = input.claim.trim();
  const link = classifyProfileLink(input.link.trim());
  if (name === "" || claim === "" || !link) return null;
  return { name, claim, socialMedia: [link], amountCents: input.amountCents, published: input.published };
}
