/**
 * @file An annual sponsor as the dashboard form edits it, and the checks that
 * decide whether it may be saved.
 *
 * Every check reads the limits and the address check from
 * `@musiccloud/shared`, the same ones the backend's route applies, so a form
 * this file accepts is a body the route accepts.
 */

import { isCalendarDay, isSponsorLink, SPONSOR_LIMITS, type Sponsor, type SponsorInput } from "@musiccloud/shared";

/**
 * The sponsor as the form edits it.
 *
 * @property name - The name as the person gave it.
 * @property links - The profile addresses, one per line, as typed.
 * @property claim - Their own sentence, empty for none.
 * @property published - Whether they agreed to be shown on the site.
 * @property paidOn - The day they paid, `YYYY-MM-DD` as a date input gives it.
 */
export interface SponsorForm {
  name: string;
  links: string;
  claim: string;
  published: boolean;
  paidOn: string;
}

/** A field of {@link SponsorForm} the backend would refuse. */
export type SponsorFormField = "name" | "links" | "claim" | "paidOn";

/** What separates the addresses in the form's text: a line break. */
const LINK_SEPARATOR = "\n";

/**
 * Splits the typed addresses into the list the backend stores.
 *
 * @param links - The text, one address per line.
 * @returns The addresses in the order typed, trimmed, without empty lines.
 */
function splitSponsorLinks(links: string): string[] {
  return links
    .split(LINK_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * The form for a new sponsor: no name, no addresses, not shown on the site
 * until their consent is recorded, paid today.
 *
 * @param today - The day to preset, `YYYY-MM-DD`.
 * @returns The empty form.
 */
export function emptySponsorForm(today: string): SponsorForm {
  return { name: "", links: "", claim: "", published: false, paidOn: today };
}

/**
 * Reads a stored sponsor into the form.
 *
 * @param sponsor - The sponsor as the backend returned them.
 * @returns The form values.
 */
export function toSponsorForm(sponsor: Sponsor): SponsorForm {
  return {
    name: sponsor.name,
    links: sponsor.links.join(LINK_SEPARATOR),
    claim: sponsor.claim,
    published: sponsor.published,
    paidOn: sponsor.paidOn,
  };
}

/**
 * Names every field the backend would refuse.
 *
 * @param form - The form as it stands.
 * @returns The refused fields. Empty when the form may be saved.
 */
export function sponsorFormProblems(form: SponsorForm): Set<SponsorFormField> {
  const problems = new Set<SponsorFormField>();
  const name = form.name.trim();
  if (name === "" || name.length > SPONSOR_LIMITS.nameMaxLength) problems.add("name");
  const links = splitSponsorLinks(form.links);
  if (links.length > SPONSOR_LIMITS.linksMaxCount || !links.every(isSponsorLink)) problems.add("links");
  if (form.claim.trim().length > SPONSOR_LIMITS.claimMaxLength) problems.add("claim");
  if (!isCalendarDay(form.paidOn)) problems.add("paidOn");
  return problems;
}

/**
 * Turns the form into the body the backend stores.
 *
 * Only call this for a form {@link sponsorFormProblems} found nothing in.
 * Name and sentence are trimmed.
 *
 * @param form - A form without problems.
 * @returns The sponsor to send.
 */
export function toSponsorInput(form: SponsorForm): SponsorInput {
  return {
    name: form.name.trim(),
    links: splitSponsorLinks(form.links),
    claim: form.claim.trim(),
    published: form.published,
    paidOn: form.paidOn,
  };
}
