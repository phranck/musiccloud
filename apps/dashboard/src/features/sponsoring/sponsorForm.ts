/**
 * @file An annual sponsor as the dashboard form edits it, and the checks that
 * decide whether it may be saved.
 *
 * Every check reads the limits and the address normalization from
 * `@musiccloud/shared`, the same ones the backend's route applies, so a form
 * this file accepts is a body the route accepts.
 */

import {
  isCalendarDay,
  normalizeSocialMediaLinks,
  type SocialMediaLinks,
  SPONSOR_LIMITS,
  type Sponsor,
  type SponsorInput,
} from "@musiccloud/shared";

/**
 * The sponsor as the form edits it.
 *
 * @property name - The name as the person gave it.
 * @property socialMedia - Where they can be found, as the social media editor holds it.
 * @property avatarId - The stored copy of their picture, or `null` for their initial.
 * @property claim - Their own sentence, empty for none.
 * @property published - Whether they agreed to be shown on the site.
 * @property paidOn - The day they paid, `YYYY-MM-DD` as a date input gives it.
 */
export interface SponsorForm {
  name: string;
  socialMedia: SocialMediaLinks;
  avatarId: string | null;
  claim: string;
  published: boolean;
  paidOn: string;
}

/** A field of {@link SponsorForm} the backend would refuse. */
export type SponsorFormField = "name" | "socialMedia" | "claim" | "paidOn";

/**
 * The form for a new sponsor: no name, no addresses, no picture, not shown on
 * the site until their consent is recorded, paid today.
 *
 * @param today - The day to preset, `YYYY-MM-DD`.
 * @returns The empty form.
 */
export function emptySponsorForm(today: string): SponsorForm {
  return { name: "", socialMedia: [], avatarId: null, claim: "", published: false, paidOn: today };
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
    socialMedia: sponsor.socialMedia,
    avatarId: sponsor.avatarId,
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
  const { links, rejected } = normalizeSocialMediaLinks(form.socialMedia);
  if (rejected.length > 0 || links.length > SPONSOR_LIMITS.socialMediaMaxCount) problems.add("socialMedia");
  if (form.claim.trim().length > SPONSOR_LIMITS.claimMaxLength) problems.add("claim");
  if (!isCalendarDay(form.paidOn)) problems.add("paidOn");
  return problems;
}

/**
 * Turns the form into the body the backend stores.
 *
 * Only call this for a form {@link sponsorFormProblems} found nothing in.
 * Name and sentence are trimmed, and every address is sent in its canonical
 * form.
 *
 * @param form - A form without problems.
 * @returns The sponsor to send.
 */
export function toSponsorInput(form: SponsorForm): SponsorInput {
  return {
    name: form.name.trim(),
    socialMedia: normalizeSocialMediaLinks(form.socialMedia).links,
    avatarId: form.avatarId,
    claim: form.claim.trim(),
    published: form.published,
    paidOn: form.paidOn,
  };
}
