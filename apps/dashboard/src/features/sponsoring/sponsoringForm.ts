/**
 * @file The sponsoring settings as the dashboard form edits them, and the
 * checks that decide whether the form may be saved.
 *
 * Every check reads the limits, patterns and IBAN checksum from
 * `@musiccloud/shared`, the same values the backend's request schema is built
 * from, so a form this file accepts is a body the route accepts. Amounts are
 * typed in euros and stored in cents, and the conversion lives here.
 */

import {
  BIC_PATTERN,
  IBAN_PATTERN,
  ibanChecksumHolds,
  normalizeAccountCode,
  SEPA_TEXT_PATTERN,
  SPONSORING_LIMITS,
  type SponsoringConfig,
} from "@musiccloud/shared";

/** One cost row as the form holds it. */
export interface CostRow {
  /** A key that stays with the row while rows are added and removed. Never sent. */
  id: string;
  /** What it is, such as "Hosting". */
  label: string;
  /** The yearly amount in euros, as typed, such as `"200"` or `"12.50"`. */
  amount: string;
}

/**
 * The setting as the form edits it.
 *
 * @property costs - The cost rows, in order.
 * @property sponsorMinimum - The sponsor minimum in euros, as typed.
 * @property payeeName - Who is paid.
 * @property payeeIban - The account, as typed or pasted, spaces allowed.
 * @property payeeBic - The bank, as typed, spaces allowed.
 * @property purposeDonation - The remittance text of a donation.
 * @property purposeSponsor - The remittance text of a sponsorship.
 * @property purposePaypal - What a PayPal donor writes into their note.
 */
export interface SponsoringForm {
  costs: CostRow[];
  sponsorMinimum: string;
  payeeName: string;
  payeeIban: string;
  payeeBic: string;
  purposeDonation: string;
  purposeSponsor: string;
  purposePaypal: string;
}

/** Cents in a euro. */
const CENTS_PER_EURO = 100;

/** Decimals a euro amount is shown with when it has cents. */
const CENT_DIGITS = 2;

/** A euro amount as typed: whole euros, optionally with one or two decimals after a point or a comma. */
const EURO_INPUT_PATTERN = /^\d+([.,]\d{1,2})?$/;

/** Payee name and purposes, compiled once with the flag the backend's schema uses. */
const SEPA_TEXT = new RegExp(SEPA_TEXT_PATTERN, "u");

/** Counter for row keys that stay unique within one page view. */
let nextRowNumber = 0;

/**
 * Makes a key for a new cost row.
 *
 * @returns A key no other row on the page carries.
 */
export function newCostRowId(): string {
  nextRowNumber += 1;
  return `cost-${nextRowNumber}`;
}

/**
 * Writes cents as the euro amount a person would type.
 *
 * @param cents - The amount in cents.
 * @returns Whole euros without decimals (`"200"`), anything else with two (`"12.50"`).
 */
export function centsToEuroInput(cents: number): string {
  return cents % CENTS_PER_EURO === 0 ? String(cents / CENTS_PER_EURO) : (cents / CENTS_PER_EURO).toFixed(CENT_DIGITS);
}

/**
 * Reads a typed euro amount as cents.
 *
 * @param value - The amount as typed, with a point or a comma before the cents.
 * @returns The amount in cents, or `null` when it is not an amount.
 */
export function euroInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!EURO_INPUT_PATTERN.test(trimmed)) return null;
  return Math.round(Number(trimmed.replace(",", ".")) * CENTS_PER_EURO);
}

/**
 * Reads the stored setting into the form.
 *
 * @param config - The setting as the backend returned it.
 * @returns The form values.
 */
export function toSponsoringForm(config: SponsoringConfig): SponsoringForm {
  return {
    costs: config.costs.map((item) => ({
      id: newCostRowId(),
      label: item.label,
      amount: centsToEuroInput(item.amountCents),
    })),
    sponsorMinimum: centsToEuroInput(config.sponsorMinimumCents),
    payeeName: config.payeeName,
    payeeIban: config.payeeIban,
    payeeBic: config.payeeBic,
    purposeDonation: config.purposeDonation,
    purposeSponsor: config.purposeSponsor,
    purposePaypal: config.purposePaypal,
  };
}

/** Whether a payee name or purpose fits its limit and the SEPA character set. */
function sepaTextFits(value: string, maxLength: number): boolean {
  return value.length <= maxLength && SEPA_TEXT.test(value);
}

/**
 * Names every field the backend would refuse.
 *
 * @param form - The form as it stands.
 * @returns The refused fields, by the same dotted paths the backend reports
 *   (`payeeIban`, `costs.2.label`), with `costs.2.amount` for a cost row's
 *   amount and `sponsorMinimum` for the minimum. Empty when the form may be saved.
 */
export function sponsoringFormProblems(form: SponsoringForm): Set<string> {
  const problems = new Set<string>();

  if (form.costs.length > SPONSORING_LIMITS.maxCostItems) problems.add("costs");
  form.costs.forEach((row, index) => {
    const label = row.label.trim();
    if (label.length === 0 || label.length > SPONSORING_LIMITS.costLabelMaxLength) {
      problems.add(`costs.${index}.label`);
    }
    const cents = euroInputToCents(row.amount);
    if (cents === null || cents > SPONSORING_LIMITS.costAmountMaxCents) problems.add(`costs.${index}.amount`);
  });

  const minimum = euroInputToCents(form.sponsorMinimum);
  if (minimum === null || minimum > SPONSORING_LIMITS.sponsorMinimumMaxCents) problems.add("sponsorMinimum");

  if (!sepaTextFits(form.payeeName, SPONSORING_LIMITS.payeeNameMaxLength)) problems.add("payeeName");
  for (const field of ["purposeDonation", "purposeSponsor", "purposePaypal"] as const) {
    if (!sepaTextFits(form[field], SPONSORING_LIMITS.purposeMaxLength)) problems.add(field);
  }

  const iban = normalizeAccountCode(form.payeeIban);
  if (iban && (!new RegExp(IBAN_PATTERN).test(iban) || !ibanChecksumHolds(iban))) problems.add("payeeIban");
  if (!new RegExp(BIC_PATTERN).test(normalizeAccountCode(form.payeeBic))) problems.add("payeeBic");

  return problems;
}

/**
 * Turns the form into the body the backend stores.
 *
 * Only call this for a form {@link sponsoringFormProblems} found nothing in.
 * Labels are trimmed, and IBAN and BIC lose their spaces and are upper-cased.
 *
 * @param form - A form without problems.
 * @returns The setting to send.
 */
export function toSponsoringConfig(form: SponsoringForm): SponsoringConfig {
  return {
    costs: form.costs.map((row) => ({ label: row.label.trim(), amountCents: euroInputToCents(row.amount) ?? 0 })),
    sponsorMinimumCents: euroInputToCents(form.sponsorMinimum) ?? 0,
    payeeName: form.payeeName,
    payeeIban: normalizeAccountCode(form.payeeIban),
    payeeBic: normalizeAccountCode(form.payeeBic),
    purposeDonation: form.purposeDonation,
    purposeSponsor: form.purposeSponsor,
    purposePaypal: form.purposePaypal,
  };
}
