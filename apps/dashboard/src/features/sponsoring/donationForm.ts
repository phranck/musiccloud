/**
 * @file A donation as the dashboard form edits it, and the checks that decide
 * whether it may be saved.
 *
 * Every check reads the limits and the day check from `@musiccloud/shared`,
 * the same values the backend's request schema is built from, so a form this
 * file accepts is a body the route accepts. The amount is typed in euros and
 * stored in cents through the conversion `sponsoringForm` owns.
 */

import {
  DONATION_LIMITS,
  type Donation,
  type DonationInput,
  DonationProvider,
  type DonationProviderValue,
  isCalendarDay,
} from "@musiccloud/shared";
import { centsToEuroInput, euroInputToCents } from "@/features/sponsoring/sponsoringForm";

/**
 * The donation as the form edits it.
 *
 * @property name - Who paid, empty for an anonymous payment.
 * @property published - Whether the donor agreed to be named on the site.
 * @property amount - The amount in euros, as typed, such as `"20"` or `"12.50"`.
 * @property receivedOn - The day the money arrived, `YYYY-MM-DD` as a date input gives it.
 * @property provider - The route it took.
 * @property note - Anything worth remembering about it.
 */
export interface DonationForm {
  name: string;
  published: boolean;
  amount: string;
  receivedOn: string;
  provider: DonationProviderValue;
  note: string;
}

/** A field of {@link DonationForm} the backend would refuse. */
export type DonationFormField = "name" | "amount" | "receivedOn" | "note";

/** Digits of a month or a day in `YYYY-MM-DD`. */
const DAY_PART_DIGITS = 2;

/**
 * Today in the operator's own time zone, as a date input states a day.
 *
 * @param now - The moment to read, the current one when absent.
 * @returns The day, `YYYY-MM-DD`.
 */
export function localDay(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(DAY_PART_DIGITS, "0");
  const day = String(now.getDate()).padStart(DAY_PART_DIGITS, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The form for a new donation: anonymous, unpublished, received today by bank
 * transfer, the route most donations take.
 *
 * @param today - The day to preset, `YYYY-MM-DD`.
 * @returns The empty form.
 */
export function emptyDonationForm(today: string): DonationForm {
  return {
    name: "",
    published: false,
    amount: "",
    receivedOn: today,
    provider: DonationProvider.BankTransfer,
    note: "",
  };
}

/**
 * Reads a stored donation into the form.
 *
 * @param donation - The row as the backend returned it.
 * @returns The form values.
 */
export function toDonationForm(donation: Donation): DonationForm {
  return {
    name: donation.name,
    published: donation.published,
    amount: centsToEuroInput(donation.amountCents),
    receivedOn: donation.receivedOn,
    provider: donation.provider,
    note: donation.note,
  };
}

/**
 * Names every field the backend would refuse.
 *
 * @param form - The form as it stands.
 * @returns The refused fields. Empty when the form may be saved.
 */
export function donationFormProblems(form: DonationForm): Set<DonationFormField> {
  const problems = new Set<DonationFormField>();
  if (form.name.trim().length > DONATION_LIMITS.nameMaxLength) problems.add("name");
  const cents = euroInputToCents(form.amount);
  if (cents === null || cents < 1 || cents > DONATION_LIMITS.amountMaxCents) problems.add("amount");
  if (!isCalendarDay(form.receivedOn)) problems.add("receivedOn");
  if (form.note.trim().length > DONATION_LIMITS.noteMaxLength) problems.add("note");
  return problems;
}

/**
 * Turns the form into the body the backend stores.
 *
 * Only call this for a form {@link donationFormProblems} found nothing in.
 * Name and note are trimmed.
 *
 * @param form - A form without problems.
 * @returns The donation to send.
 */
export function toDonationInput(form: DonationForm): DonationInput {
  return {
    name: form.name.trim(),
    published: form.published,
    amountCents: euroInputToCents(form.amount) ?? 0,
    receivedOn: form.receivedOn,
    provider: form.provider,
    note: form.note.trim(),
  };
}
