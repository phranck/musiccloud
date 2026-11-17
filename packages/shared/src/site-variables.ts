/**
 * @file Figures the system knows, written into a page as a name.
 *
 * Somebody writing a page has no way to name a number that lives in a plan, a
 * setting or a rate limiter, so every sentence quoting one has to be found and
 * edited by hand when it moves. A variable is written once and follows.
 *
 * The braces are the notation the shortcode vocabulary already uses, so an
 * editor learns one syntax rather than two. A single pair marks a variable and
 * a double pair marks a key on a keyboard, which is what keeps the two apart.
 * Anything not named here is left standing exactly as it was typed, so an
 * unrelated `{word}` in prose survives.
 */

import { formatEuroCents } from "./sponsoring.js";

/**
 * How a variable's value is written into a page.
 *
 * - `Figure`: a count, with its thousands grouped (`10,000`).
 * - `Money`: an amount in cents, written in euros (`€230`, `€19.17`).
 * - `Amount`: whole euros as a bare number (`60`), because these are written
 *   into a shortcode's `amount=` and read back as a number, where a separator
 *   or a currency sign would break it.
 * - `Text`: written exactly as the backend supplies it.
 */
export const SiteVariableKind = {
  Figure: "figure",
  Money: "money",
  Amount: "amount",
  Text: "text",
} as const;

/** A {@link SiteVariableKind} member value. */
export type SiteVariableKindValue = (typeof SiteVariableKind)[keyof typeof SiteVariableKind];

/**
 * What every variable is called, what it says, and how it is written.
 *
 * The label is what the editor's reference shows somebody looking for the
 * name, so it is written for them rather than for whoever implements it. The
 * example is what a plausible value looks like, so the list can be read without
 * a running system behind it. The kind decides how the value is written.
 */
export const SITE_VARIABLES = {
  freeRequestsPerMinute: {
    label: "Requests a minute on the free plan, as the plan is configured",
    example: "60",
    kind: SiteVariableKind.Figure,
  },
  freeRequestsPerDay: {
    label: "Requests a day on the free plan, as the plan is configured",
    example: "10,000",
    kind: SiteVariableKind.Figure,
  },
  projectsPerAccount: {
    label: "How many projects one account may hold, as set in the dashboard",
    example: "3",
    kind: SiteVariableKind.Figure,
  },
  registrationsPerProject: {
    label: "How many registrations one project may hold",
    example: "5",
    kind: SiteVariableKind.Figure,
  },
  keylessRequestsPerMinute: {
    label: "Requests a minute the keyless resolve endpoint allows, per client",
    example: "10",
    kind: SiteVariableKind.Figure,
  },
  keylessRequestsPerDay: {
    label: "Requests a day the keyless resolve endpoint allows, per client",
    example: "500",
    kind: SiteVariableKind.Figure,
  },
  annualCost: {
    label: "What running musiccloud costs a year, the sum of the costs under Sponsoring",
    example: "€230",
    kind: SiteVariableKind.Money,
  },
  monthlyCost: {
    label: "The same costs for one month",
    example: "€19.17",
    kind: SiteVariableKind.Money,
  },
  amountWeek: {
    label: "A week's share of the costs, rounded up, in euros without a sign, for an amount",
    example: "5",
    kind: SiteVariableKind.Amount,
  },
  amountMonth: {
    label: "A month's share of the costs, rounded up, in euros without a sign, for an amount",
    example: "20",
    kind: SiteVariableKind.Amount,
  },
  amountQuarter: {
    label: "A quarter's share of the costs, rounded up, in euros without a sign, for an amount",
    example: "60",
    kind: SiteVariableKind.Amount,
  },
  amountYear: {
    label: "The whole year's costs, rounded up, in euros without a sign, for an amount",
    example: "230",
    kind: SiteVariableKind.Amount,
  },
  amountMonthHalf: {
    label: "Half a month's share, rounded up, in euros without a sign, for an amount",
    example: "10",
    kind: SiteVariableKind.Amount,
  },
  amountMonthQuarter: {
    label: "A quarter of a month's share, rounded up, in euros without a sign, for an amount",
    example: "5",
    kind: SiteVariableKind.Amount,
  },
  peoplePerYear: {
    label: "How many people giving one month's amount carry the whole year",
    example: "12",
    kind: SiteVariableKind.Figure,
  },
  amountSponsorMin: {
    label: "The least a sponsor gives, as set under Sponsoring, in euros without a sign",
    example: "40",
    kind: SiteVariableKind.Amount,
  },
  payeeName: {
    label: "Who a transfer goes to, as set under Sponsoring",
    example: "Frank Gregor",
    kind: SiteVariableKind.Text,
  },
  payeeIban: {
    label: "The payee's IBAN, in groups of four",
    example: "AT61 1904 3002 3457 3201",
    kind: SiteVariableKind.Text,
  },
  payeeBic: {
    label: "The payee's BIC, as set under Sponsoring",
    example: "BKAUATWW",
    kind: SiteVariableKind.Text,
  },
  purposeDonation: {
    label: "The purpose of a donation transfer, as set under Sponsoring",
    example: "Donation: musiccloud.io",
    kind: SiteVariableKind.Text,
  },
  purposeSponsor: {
    label: "The purpose of a transfer large enough for a sponsorship, as set under Sponsoring",
    example: "Sponsor: musiccloud.io",
    kind: SiteVariableKind.Text,
  },
  purposePaypal: {
    label: "What a PayPal donor writes into their note, as set under Sponsoring",
    example: "musiccloud.io",
    kind: SiteVariableKind.Text,
  },
} as const satisfies Record<string, { label: string; example: string; kind: SiteVariableKindValue }>;

/** The name of one variable. */
export type SiteVariableName = keyof typeof SITE_VARIABLES;

/** Every variable, in declaration order. */
export const SITE_VARIABLE_NAMES = Object.keys(SITE_VARIABLES) as SiteVariableName[];

/**
 * The values a page may name, one per variable, each read from the one place
 * that owns it.
 *
 * A `Text` variable carries a string. Every other kind carries a number: a
 * count for `Figure`, cents for `Money`, whole euros for `Amount`. The backend
 * fills every name, which the shared tests hold against {@link SITE_VARIABLES}.
 */
export type SiteVariableValues = {
  [Name in SiteVariableName]: (typeof SITE_VARIABLES)[Name]["kind"] extends typeof SiteVariableKind.Text
    ? string
    : number;
};

/**
 * The locale every figure is written in.
 *
 * One locale rather than a formatter passed in, because the site, the portal
 * and the dashboard are English throughout, so there is nothing here for a
 * caller to decide.
 */
const NUMBER_LOCALE = "en-GB";

/** Only the names above, so an unrelated `{word}` is never touched. */
const VARIABLE_PATTERN = new RegExp(`(?<!\\{)\\{(${SITE_VARIABLE_NAMES.join("|")})\\}(?!\\})`, "g");

/**
 * Writes one variable's value the way its kind says.
 *
 * @param name - The variable.
 * @param values - Every value, as the backend filled them.
 * @returns The text that stands in the page in place of the name.
 */
function writeVariable(name: SiteVariableName, values: SiteVariableValues): string {
  const value = values[name];
  switch (SITE_VARIABLES[name].kind) {
    case SiteVariableKind.Figure:
      // Grouped, because these run to five digits and a reader takes `10,000`
      // in at a glance where they have to count `10000`.
      return Number(value).toLocaleString(NUMBER_LOCALE);
    case SiteVariableKind.Money:
      return formatEuroCents(Number(value));
    case SiteVariableKind.Amount:
      return String(value);
    case SiteVariableKind.Text:
      return String(value);
  }
}

/**
 * Puts the values in place of their names.
 *
 * Run before the page is parsed, so a variable works anywhere a person can
 * type: in prose, in a heading, and inside a shortcode's attribute alike.
 *
 * @param text - What was written, with or without variables in it.
 * @param values - The values, each already read from the place that owns it.
 * @returns The text with every known variable replaced. Anything else stands
 *   exactly as it was written.
 */
export function expandSiteVariables(text: string, values: SiteVariableValues): string {
  // Nothing to do for the great majority of pages, and this runs on every
  // render of every one of them.
  if (!text.includes("{")) return text;

  return text.replace(VARIABLE_PATTERN, (_match, name: SiteVariableName) => writeVariable(name, values));
}
