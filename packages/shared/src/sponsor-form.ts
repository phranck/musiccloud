/**
 * @file Every word the sponsor form puts on screen.
 *
 * Ported from lmaa.space (`packages/shared/src/markdown-shortcodes/sponsor-form-labels.ts`).
 * All of it is content rather than code, because it is the site speaking to
 * somebody about to give money, and that is the operator's voice. The
 * `[[sponsorform]]` shortcode's parameter list is derived from these entries,
 * so a new word is added in one place.
 *
 * Every text is plain, so the site sets it as text and never as markup. A
 * refusal from the backend is shown with the backend's own message, which
 * carries its `MC-*` code, so no entry here words a refusal.
 */

/** What the counter under the sentence writes for the characters still free: `{n}`. */
export const SPONSOR_FORM_REMAINING_PLACEHOLDER = "{n}";

/**
 * The words of the form, each with the wording used when the shortcode names
 * nothing and the name the editor's reference gives it.
 *
 * - `nameLabel`, `linkLabel`, `claimLabel`: the three fields' labels.
 * - `linkPlaceholder`: what the empty address field shows.
 * - `linkHint`: the sentence under the fields, saying one address is enough.
 * - `linkInvalid`: what stands there instead when the address cannot be linked.
 * - `claimRemaining`: the counter beside the sentence, with
 *   {@link SPONSOR_FORM_REMAINING_PLACEHOLDER} for the characters still free.
 * - `publishedLabel`: the switch that decides whether the name appears on the site.
 * - `submitLabel`, `submitBusyLabel`: the button, and what it says while the site is asked.
 * - `issuedTitle`, `issuedText`: what replaces the form once a reference is issued.
 * - `changeLabel`: the button that opens the form again on what was sent.
 * - `failureTitle`, `failureClose`: the heading and the button of the dialog a refusal opens.
 * - `failureOffline`: what that dialog says when the site could not be reached at all.
 */
export const SPONSOR_FORM_LABELS = {
  nameLabel: { value: "Name", label: "Label of the name field" },
  linkLabel: { value: "Website or profile", label: "Label of the address field" },
  linkPlaceholder: { value: "your-site.com", label: "What the empty address field shows" },
  linkHint: {
    value:
      "One address is enough, whether your own site, Mastodon, Bluesky or GitHub. We work out which service it is.",
    label: "The sentence under the fields",
  },
  linkInvalid: {
    value: "We cannot link to that address. Please give a website or a profile.",
    label: "What the form says about an address it cannot link to",
  },
  claimLabel: { value: "Your sentence", label: "Label of the sentence field" },
  claimRemaining: {
    value: `${SPONSOR_FORM_REMAINING_PLACEHOLDER} characters left`,
    label: `Counter beside the sentence field. ${SPONSOR_FORM_REMAINING_PLACEHOLDER} stands for the characters still free`,
  },
  publishedLabel: { value: "Show my name on the site", label: "Label of the switch for being named" },
  submitLabel: { value: "Get my payment reference", label: "Label of the send button" },
  submitBusyLabel: { value: "One moment…", label: "What the send button says while sending" },
  issuedTitle: { value: "Your details are in.", label: "Heading once the reference is issued" },
  issuedText: {
    value: "The transfer below now carries your reference. Once the money arrives, you join the sponsors.",
    label: "Text once the reference is issued",
  },
  changeLabel: { value: "Change my details", label: "Label of the button that opens the form again" },
  failureTitle: { value: "That did not work", label: "Heading of the dialog a refusal opens" },
  failureClose: { value: "Got it", label: "Button that closes that dialog" },
  failureOffline: {
    value: "The site could not be reached. Please check your connection and try again.",
    label: "What the dialog says when the site could not be reached",
  },
} as const satisfies Record<string, { value: string; label: string }>;

/** The name of one word on the sponsor form. */
export type SponsorFormLabelKey = keyof typeof SPONSOR_FORM_LABELS;

/** Every word on the sponsor form, in declaration order. */
export const SPONSOR_FORM_LABEL_KEYS = Object.keys(SPONSOR_FORM_LABELS) as SponsorFormLabelKey[];

/** The wording used where the shortcode names no override, one entry per {@link SponsorFormLabelKey}. */
export const SPONSOR_FORM_DEFAULTS = Object.fromEntries(
  SPONSOR_FORM_LABEL_KEYS.map((key) => [key, SPONSOR_FORM_LABELS[key].value]),
) as Record<SponsorFormLabelKey, string>;

/**
 * The page's overrides of the form's words, as the ladder's configuration
 * carries them. A key the page named nothing for is absent, and the site uses
 * {@link SPONSOR_FORM_DEFAULTS} for it.
 */
export type SponsorFormTexts = Partial<Record<SponsorFormLabelKey, string>>;
