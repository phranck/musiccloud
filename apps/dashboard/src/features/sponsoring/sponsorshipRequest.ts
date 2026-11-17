/**
 * @file The takeover form that turns a sponsorship request into a sponsor.
 * How long a request still stands is `pendingSponsorshipDaysLeft` in
 * `@musiccloud/shared`, the rule the backend's sweep removes requests by.
 *
 * Ported from lmaa.space (`PendingSponsorshipsPage.tsx`, whose dialog holds the
 * same two fields). The checks read the limit and the day check from
 * `@musiccloud/shared`, the values `PENDING_SPONSORSHIP_TAKEOVER_SCHEMA` is
 * built from, so a form this file accepts is a body the route accepts. The
 * amount is typed in euros and sent in cents through the conversion
 * `sponsoringForm` owns.
 */

import {
  isCalendarDay,
  PENDING_SPONSORSHIP_LIMITS,
  type PendingSponsorship,
  type PendingSponsorshipTakeover,
} from "@musiccloud/shared";
import { centsToEuroInput, euroInputToCents } from "@/features/sponsoring/sponsoringForm";

/**
 * The takeover as the form edits it.
 *
 * @property amount - What arrived, in euros as typed, such as `"60"` or `"12.50"`.
 * @property paidOn - The day it arrived, `YYYY-MM-DD` as a date input gives it.
 */
export interface SponsorshipTakeoverForm {
  amount: string;
  paidOn: string;
}

/** A field of {@link SponsorshipTakeoverForm} the backend would refuse. */
export type SponsorshipTakeoverField = "amount" | "paidOn";

/**
 * The form a takeover opens with: the amount the person announced, which is
 * the one their GiroCode carried, and today for the day. Both are offered
 * rather than taken, because the statement says what actually arrived and when.
 *
 * @param request - The request being taken over.
 * @param today - The day to preset, `YYYY-MM-DD`.
 * @param sponsorMinimumCents - The sponsoring settings' minimum in cents,
 *   preset as the amount when the request announced none, as lmaa.space does.
 * @returns The form.
 */
export function toSponsorshipTakeoverForm(
  request: PendingSponsorship,
  today: string,
  sponsorMinimumCents: number,
): SponsorshipTakeoverForm {
  const presetCents = request.amountCents > 0 ? request.amountCents : sponsorMinimumCents;
  return { amount: centsToEuroInput(presetCents), paidOn: today };
}

/**
 * Names every field the backend would refuse.
 *
 * @param form - The form as it stands.
 * @returns The refused fields: `amount` unless it is an amount from 1 cent to
 *   `PENDING_SPONSORSHIP_LIMITS.amountMaxCents`, `paidOn` unless it is a day that
 *   exists. Empty when the form may be sent.
 */
export function sponsorshipTakeoverProblems(form: SponsorshipTakeoverForm): Set<SponsorshipTakeoverField> {
  const problems = new Set<SponsorshipTakeoverField>();
  const cents = euroInputToCents(form.amount);
  if (
    cents === null ||
    cents < PENDING_SPONSORSHIP_LIMITS.takeoverMinCents ||
    cents > PENDING_SPONSORSHIP_LIMITS.amountMaxCents
  ) {
    problems.add("amount");
  }
  if (!isCalendarDay(form.paidOn)) problems.add("paidOn");
  return problems;
}

/**
 * Turns the form into the body the takeover route takes.
 *
 * Only call this for a form {@link sponsorshipTakeoverProblems} found nothing in.
 *
 * @param form - A form without problems.
 * @returns The amount in cents and the day it arrived.
 */
export function toSponsorshipTakeover(form: SponsorshipTakeoverForm): PendingSponsorshipTakeover {
  return { amountCents: euroInputToCents(form.amount) ?? 0, paidOn: form.paidOn };
}
