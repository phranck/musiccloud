/**
 * @file What running musiccloud costs, who is paid, and what a transfer says.
 *
 * The support page, its GiroCode and every sentence naming a figure read these
 * values, so they are entered once in the dashboard and stored as one setting.
 * This module holds what both sides of that setting need: the limits and
 * patterns the backend's request schema is built from, the IBAN checksum the
 * schema cannot express, the parser for the stored value, and the amounts the
 * page derives from the running costs.
 */

import { checkDigitsHold } from "./iso7064.js";

/**
 * Bounds on every field of the setting.
 *
 * The backend's request schema and the dashboard's inputs both read these, so a
 * field the form accepts is a field the route accepts.
 */
export const SPONSORING_LIMITS = {
  /** Most cost items one year can list: 20. */
  maxCostItems: 20,
  /** Longest label of a cost item, such as "Hosting": 120 characters. */
  costLabelMaxLength: 120,
  /** Largest yearly amount of one cost item: 10,000,000 cents, which is 100,000 euros. */
  costAmountMaxCents: 10_000_000,
  /** Largest minimum a sponsor can be asked for: 1,000,000 cents, which is 10,000 euros. */
  sponsorMinimumMaxCents: 1_000_000,
  /** Longest payee name: 70 characters, the limit of the beneficiary field in a GiroCode. */
  payeeNameMaxLength: 70,
  /** Longest purpose: 140 characters, the limit of the remittance text in a GiroCode. */
  purposeMaxLength: 140,
} as const;

/**
 * The characters a payee name and a purpose may contain.
 *
 * Letters of any script, digits, the space and `/ - ? : ( ) . , ' +`. These
 * are the characters a SEPA transfer carries. Because Markdown, shortcode and
 * HTML syntax all need a character outside this set, a value expanded into a
 * page can never form syntax there. Empty is allowed. Written as a pattern
 * source for the backend's request schema, which compiles it with the `u` flag.
 */
export const SEPA_TEXT_PATTERN = "^[\\p{L}0-9 /?:().,'+-]*$";

/**
 * An IBAN as stored: country, check digits and 11 to 30 letters or digits, in
 * capitals and without spaces. Empty means no account has been entered yet.
 */
export const IBAN_PATTERN = "^([A-Z]{2}[0-9]{2}[A-Z0-9]{11,30})?$";

/**
 * A BIC as stored: 8 or 11 characters in capitals. Empty is allowed, because a
 * payee inside the EEA need not name one.
 */
export const BIC_PATTERN = "^([A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?)?$";

/** One line of what the year costs. */
export interface SponsoringCostItem {
  /** What it is, such as "Hosting" or "Domain". 1 to {@link SPONSORING_LIMITS.costLabelMaxLength} characters. */
  label: string;
  /** What it costs for a year, in cents. 0 to {@link SPONSORING_LIMITS.costAmountMaxCents}. */
  amountCents: number;
}

/**
 * Everything the support page is built from, as one stored setting.
 *
 * @property costs - The year's running costs, at most {@link SPONSORING_LIMITS.maxCostItems}
 *   items. Their sum is the annual cost every suggested amount is derived from.
 * @property sponsorMinimumCents - What a sponsor gives at least to be named for
 *   a year, 0 to {@link SPONSORING_LIMITS.sponsorMinimumMaxCents}.
 * @property payeeName - Who is paid, as the transfer names them. Empty until entered.
 * @property payeeIban - The account, matching {@link IBAN_PATTERN}. Empty until entered.
 * @property payeeBic - The bank, matching {@link BIC_PATTERN}. May stay empty.
 * @property purposeDonation - The remittance text of a plain donation.
 * @property purposeSponsor - The remittance text of a payment large enough for a sponsorship.
 * @property purposePaypal - What a PayPal donor writes into their note.
 */
export interface SponsoringConfig {
  costs: SponsoringCostItem[];
  sponsorMinimumCents: number;
  payeeName: string;
  payeeIban: string;
  payeeBic: string;
  purposeDonation: string;
  purposeSponsor: string;
  purposePaypal: string;
}

/**
 * The word a transfer's remittance text has to contain to count as a donation
 * to musiccloud: `musiccloud.io`.
 *
 * The bank import books a transfer without a sponsorship reference only when
 * its purpose contains this, matched without regard to case or spacing. It is
 * the production host rather than whatever host a deployment runs under,
 * because the account belongs to production and payers write the site's name.
 * Every default purpose below carries it, which is what makes a transfer made
 * from the support page findable.
 */
export const SPONSORING_REMITTANCE_MARKER = "musiccloud.io";

/**
 * The setting in force while nothing has been saved.
 *
 * No costs, no account, and a sponsor minimum of 4,000 cents (40 euros), the
 * figure lmaa.space starts from. The purposes name
 * {@link SPONSORING_REMITTANCE_MARKER}, because the bank import recognizes a
 * donation by it.
 */
export const SPONSORING_DEFAULTS: SponsoringConfig = {
  costs: [],
  sponsorMinimumCents: 4000,
  payeeName: "",
  payeeIban: "",
  payeeBic: "",
  purposeDonation: `Donation: ${SPONSORING_REMITTANCE_MARKER}`,
  purposeSponsor: `Sponsor: ${SPONSORING_REMITTANCE_MARKER}`,
  purposePaypal: SPONSORING_REMITTANCE_MARKER,
};

/** A text field restricted to {@link SEPA_TEXT_PATTERN}, at most `maxLength` long. */
function sepaText(maxLength: number) {
  return { type: "string", maxLength, pattern: SEPA_TEXT_PATTERN } as const;
}

/**
 * The request schema of the setting, for the backend route.
 *
 * Built from {@link SPONSORING_LIMITS} and the patterns above, so the route and
 * the dashboard's inputs are bounded by the same numbers. Every field is
 * required and nothing else is accepted. The IBAN checksum cannot be expressed
 * here and is checked by {@link ibanChecksumHolds}.
 */
export const SPONSORING_CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "costs",
    "sponsorMinimumCents",
    "payeeName",
    "payeeIban",
    "payeeBic",
    "purposeDonation",
    "purposeSponsor",
    "purposePaypal",
  ],
  properties: {
    costs: {
      type: "array",
      maxItems: SPONSORING_LIMITS.maxCostItems,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "amountCents"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: SPONSORING_LIMITS.costLabelMaxLength },
          amountCents: { type: "integer", minimum: 0, maximum: SPONSORING_LIMITS.costAmountMaxCents },
        },
      },
    },
    sponsorMinimumCents: { type: "integer", minimum: 0, maximum: SPONSORING_LIMITS.sponsorMinimumMaxCents },
    payeeName: sepaText(SPONSORING_LIMITS.payeeNameMaxLength),
    payeeIban: { type: "string", pattern: IBAN_PATTERN },
    payeeBic: { type: "string", pattern: BIC_PATTERN },
    purposeDonation: sepaText(SPONSORING_LIMITS.purposeMaxLength),
    purposeSponsor: sepaText(SPONSORING_LIMITS.purposeMaxLength),
    purposePaypal: sepaText(SPONSORING_LIMITS.purposeMaxLength),
  },
} as const;

/**
 * Why a field of the setting was refused.
 *
 * - `Format`: the value does not meet {@link SPONSORING_CONFIG_SCHEMA}: a
 *   length, a range, a pattern, or a missing field.
 * - `Checksum`: the IBAN has the right form but its check digits do not hold.
 */
export const SponsoringProblemReason = {
  Format: "format",
  Checksum: "checksum",
} as const;

/** A {@link SponsoringProblemReason} member value. */
export type SponsoringProblemReasonValue = (typeof SponsoringProblemReason)[keyof typeof SponsoringProblemReason];

/**
 * One refused field, as the route reports it beside `MC-REQ-0011`.
 *
 * @property field - The field's path with dots, such as `payeeIban` or
 *   `costs.2.label`.
 * @property reason - Why it was refused.
 */
export interface SponsoringProblem {
  field: string;
  reason: SponsoringProblemReasonValue;
}

/**
 * Writes an IBAN or a BIC the way it is stored: without spaces, in capitals.
 *
 * The dashboard applies this before saving, so a pasted `at55 1900 ...` is
 * stored as `AT551900...` and matches {@link IBAN_PATTERN}.
 *
 * @param value - The code as typed or pasted.
 * @returns The code without whitespace, upper-cased.
 */
export function normalizeAccountCode(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * Checks the two check digits of an IBAN (ISO 13616, modulus 97).
 *
 * A single mistyped character always fails this, so a payee account that
 * passes it is at least one that exists in form.
 *
 * @param iban - The account as stored, matching {@link IBAN_PATTERN}.
 * @returns `true` when the check digits hold. An empty or malformed value fails.
 */
export function ibanChecksumHolds(iban: string): boolean {
  if (!iban || !new RegExp(IBAN_PATTERN).test(iban)) return false;
  return checkDigitsHold(iban);
}

/**
 * Prints an IBAN in groups of four, the way a banking app shows it.
 *
 * @param iban - The account as stored, without spaces.
 * @returns The same account in groups of four, or an empty string for an empty one.
 */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** Takes a string field of a stored setting, or the default when it is not one. */
function storedString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Takes a whole non-negative number of a stored setting, or the default. */
function storedCents(value: unknown, fallback: number): number {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}

/**
 * Reads the stored setting back.
 *
 * Every write went through the route's schema, so this only guards against a
 * row edited by hand: anything unreadable falls back to
 * {@link SPONSORING_DEFAULTS}, field by field, and a page never fails to render
 * because of it.
 *
 * @param raw - The stored JSON, or `null` when nothing has been saved.
 * @returns A complete setting.
 */
export function parseSponsoringConfig(raw: string | null): SponsoringConfig {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const costs = Array.isArray(stored.costs)
    ? stored.costs
        .filter(
          (item): item is { label: string; amountCents: number } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as { label?: unknown }).label === "string" &&
            Number.isInteger((item as { amountCents?: unknown }).amountCents),
        )
        .map((item) => ({ label: item.label, amountCents: item.amountCents }))
    : SPONSORING_DEFAULTS.costs;

  return {
    costs,
    sponsorMinimumCents: storedCents(stored.sponsorMinimumCents, SPONSORING_DEFAULTS.sponsorMinimumCents),
    payeeName: storedString(stored.payeeName, SPONSORING_DEFAULTS.payeeName),
    payeeIban: storedString(stored.payeeIban, SPONSORING_DEFAULTS.payeeIban),
    payeeBic: storedString(stored.payeeBic, SPONSORING_DEFAULTS.payeeBic),
    purposeDonation: storedString(stored.purposeDonation, SPONSORING_DEFAULTS.purposeDonation),
    purposeSponsor: storedString(stored.purposeSponsor, SPONSORING_DEFAULTS.purposeSponsor),
    purposePaypal: storedString(stored.purposePaypal, SPONSORING_DEFAULTS.purposePaypal),
  };
}

/** Cents in a euro: 100. The site and the backend convert between the two through this one figure. */
export const CENTS_PER_EURO = 100;

/** Months in a year, which the monthly figure divides by. */
const MONTHS_PER_YEAR = 12;

/** Weeks in a year, for the amount that covers one. */
const WEEKS_PER_YEAR = 52;

/** Quarters in a year, for the amount that covers one. */
const QUARTERS_PER_YEAR = 4;

/** The half of a month's amount, for the smaller monthly suggestion. */
const HALF = 2;

/** The quarter of a month's amount, for the smallest monthly suggestion. */
const QUARTER = 4;

/**
 * The step a suggested amount is rounded up to: 5 euros.
 *
 * A ladder of 5, 20, 60 reads as chosen, and one of 4.33, 18.75, 56.25 reads as
 * the remainder of a calculation.
 */
const AMOUNT_STEP_EUR = 5;

/** Below this many euros the step is a whole euro, so a small amount is not lifted to 5. */
const AMOUNT_STEP_THRESHOLD_EUR = 5;

/**
 * Rounds a derived amount to one a person would choose.
 *
 * Always up, never to the nearest: an amount says it covers a period and has
 * to cover it. At 225 euros a year a quarter costs 56.25, and 55 would claim a
 * quarter while paying for 89 of its 91 days.
 *
 * @param cents - The exact amount, in cents.
 * @returns Whole euros at or above the exact amount: the next multiple of
 *   {@link AMOUNT_STEP_EUR}, or the next whole euro below
 *   {@link AMOUNT_STEP_THRESHOLD_EUR}. Zero for zero or less.
 */
export function roundSuggestedAmountEur(cents: number): number {
  const euros = cents / CENTS_PER_EURO;
  if (euros <= 0) return 0;
  if (euros < AMOUNT_STEP_THRESHOLD_EUR) return Math.ceil(euros);
  return Math.ceil(euros / AMOUNT_STEP_EUR) * AMOUNT_STEP_EUR;
}

/**
 * The figures the support page derives from the running costs.
 *
 * @property annualCostCents - The sum of every cost item, in cents.
 * @property monthlyCostCents - The annual cost divided by 12, rounded to the cent.
 * @property weekEur - A week's share, rounded up by {@link roundSuggestedAmountEur}.
 * @property monthEur - A month's share, rounded up the same way.
 * @property quarterEur - A quarter's share, rounded up the same way.
 * @property yearEur - The whole year, rounded up the same way.
 * @property monthHalfEur - Half a month's share, rounded up the same way.
 * @property monthQuarterEur - A quarter of a month's share, rounded up the same way.
 * @property peoplePerYear - How many people giving {@link monthEur} once carry
 *   the year. Derived from the rounded month so a sentence naming both agrees.
 *   Zero when nothing costs anything.
 * @property sponsorMinimumEur - The sponsor minimum in whole euros, rounded up.
 */
export interface SupportAmounts {
  annualCostCents: number;
  monthlyCostCents: number;
  weekEur: number;
  monthEur: number;
  quarterEur: number;
  yearEur: number;
  monthHalfEur: number;
  monthQuarterEur: number;
  peoplePerYear: number;
  sponsorMinimumEur: number;
}

/**
 * Derives every amount the support page names from the setting.
 *
 * The site variables and the support ladder both read this, so a sentence and
 * the amount card beside it can never disagree.
 *
 * @param config - The stored setting.
 * @returns The derived figures.
 */
export function deriveSupportAmounts(config: SponsoringConfig): SupportAmounts {
  const annualCostCents = config.costs.reduce((sum, item) => sum + item.amountCents, 0);
  const monthEur = roundSuggestedAmountEur(annualCostCents / MONTHS_PER_YEAR);
  return {
    annualCostCents,
    monthlyCostCents: Math.round(annualCostCents / MONTHS_PER_YEAR),
    weekEur: roundSuggestedAmountEur(annualCostCents / WEEKS_PER_YEAR),
    monthEur,
    quarterEur: roundSuggestedAmountEur(annualCostCents / QUARTERS_PER_YEAR),
    yearEur: roundSuggestedAmountEur(annualCostCents),
    monthHalfEur: roundSuggestedAmountEur(annualCostCents / MONTHS_PER_YEAR / HALF),
    monthQuarterEur: roundSuggestedAmountEur(annualCostCents / MONTHS_PER_YEAR / QUARTER),
    peoplePerYear: monthEur > 0 ? Math.ceil(annualCostCents / CENTS_PER_EURO / monthEur) : 0,
    sponsorMinimumEur: Math.ceil(config.sponsorMinimumCents / CENTS_PER_EURO),
  };
}

/**
 * The locale money is written in.
 *
 * British English, the locale the site's other figures use, so a euro amount
 * reads `€230` beside a figure reading `10,000`.
 */
const MONEY_LOCALE = "en-GB";

/** The currency every amount here is in. */
const MONEY_CURRENCY = "EUR";

/** Decimals shown for an amount with cents. */
const CENT_DIGITS = 2;

/**
 * Writes an amount of money the way a sentence carries it.
 *
 * Whole euros without decimals (`€230`), anything else with two (`€19.17`).
 *
 * @param cents - The amount, in cents.
 * @returns The amount in euros, in {@link MONEY_LOCALE}.
 */
export function formatEuroCents(cents: number): string {
  const digits = cents % CENTS_PER_EURO === 0 ? 0 : CENT_DIGITS;
  return new Intl.NumberFormat(MONEY_LOCALE, {
    style: "currency",
    currency: MONEY_CURRENCY,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / CENTS_PER_EURO);
}
