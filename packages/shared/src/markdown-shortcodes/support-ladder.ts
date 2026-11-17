/**
 * @file The support ladder and everything that may stand inside it.
 *
 * The nodes are declared from the innermost outwards, because each parent names
 * its children by reference. The ladder is hydrated on the site, so every node
 * is an island part: the backend reads the tree and hands the site its
 * configuration, as `support-ladder.ts` in this package describes.
 *
 * Who is paid is not here. The payee, the account and the bank are set under
 * Sponsoring in the dashboard and reach the ladder at render time, so a page
 * cannot name a different account.
 */

import { ContentContext } from "../content-context.js";
import { SPONSOR_FORM_LABEL_KEYS, SPONSOR_FORM_LABELS, type SponsorFormLabel } from "../sponsor-form.js";
import {
  SUPPORT_INTERVAL_KEYS,
  SUPPORT_LADDER_LABEL_KEYS,
  SUPPORT_LADDER_LABELS,
  SUPPORT_LADDER_LIMITS,
  SUPPORT_QR_CORNER_TYPES,
  SUPPORT_QR_DOT_TYPES,
  SupportBrandIcon,
} from "../support-ladder.js";
import { ShortcodeToken } from "./tokens.js";
import {
  ShortcodeBodyRule,
  type ShortcodeDefinition,
  type ShortcodeParamDefinition,
  ShortcodeParamType,
  ShortcodePlacement,
  ShortcodeRenderMode,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./types.js";

/** The ladder belongs to the site's support page, and the portal has none. */
const SITE_ONLY = ContentContext.Frontend;

/** The parts every node of the ladder shares: a bracket island part that takes no target. */
const LADDER_PART = {
  syntax: ShortcodeSyntax.Bracket,
  renderMode: ShortcodeRenderMode.Island,
  target: ShortcodeTargetRule.Forbidden,
  allowedContextMask: SITE_ONLY,
} as const;

/** The brand marks a card may show, as the editor lists them. */
const BRAND_ICON_VALUES = Object.values(SupportBrandIcon);

/** The `icon` parameter a card takes. */
const ICON_PARAM: ShortcodeParamDefinition = {
  name: "icon",
  type: ShortcodeParamType.Enum,
  values: BRAND_ICON_VALUES,
  label: "Brand mark beside the heading",
};

/** The `key` parameter a tab and a variant take. */
const INTERVAL_KEY_PARAM: ShortcodeParamDefinition = {
  name: "key",
  type: ShortcodeParamType.Enum,
  values: SUPPORT_INTERVAL_KEYS,
  required: true,
  label: "Which tab: once, monthly or sponsor",
};

/**
 * How the GiroCode looks.
 *
 * It hangs off the variant it belongs to, in practice the one with
 * `key="once"`. A GiroCode cannot express a standing order, so a `qrcode` under
 * the monthly variant changes nothing.
 */
export const SUPPORT_LADDER_QRCODE_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.QrCode,
  placement: ShortcodePlacement.Inline,
  label: "GiroCode",
  description: "How the GiroCode looks. Without this node the code is drawn in its default colors and shapes.",
  examples: ['[[qrcode color="#1c1c1e" background="#ffffff" dots="rounded" size=176]]'],
  params: [
    { name: "color", type: ShortcodeParamType.String, label: "Color of the dots, as a hex value" },
    { name: "background", type: ShortcodeParamType.String, label: "Color of the quiet zone, as a hex value" },
    {
      name: "size",
      type: ShortcodeParamType.Integer,
      min: SUPPORT_LADDER_LIMITS.qrMinSize,
      max: SUPPORT_LADDER_LIMITS.qrMaxSize,
      label: "Edge length in pixels",
    },
    {
      name: "margin",
      type: ShortcodeParamType.Integer,
      min: SUPPORT_LADDER_LIMITS.qrMinMargin,
      max: SUPPORT_LADDER_LIMITS.qrMaxMargin,
      label: "Quiet zone in pixels",
    },
    {
      name: "dots",
      aliases: ["pixelType"],
      type: ShortcodeParamType.Enum,
      values: SUPPORT_QR_DOT_TYPES,
      label: "Shape of the dots",
    },
    {
      name: "corners",
      type: ShortcodeParamType.Enum,
      values: SUPPORT_QR_CORNER_TYPES,
      label: "Shape of the corner marks",
    },
    { name: "image", type: ShortcodeParamType.String, label: "Picture in the middle, as a path on this site" },
  ],
} as const satisfies ShortcodeDefinition;

/** A short notice inside the transfer card, drawn as a tinted sub-card. */
export const SUPPORT_LADDER_INFO_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.Info,
  placement: ShortcodePlacement.Inline,
  label: "Notice",
  description:
    "A notice inside the transfer card, as a tinted sub-card. Markdown. Without this node no notice appears.",
  examples: ['[[info text="Check that your banking app shows the same details."]]'],
  params: [{ name: "text", type: ShortcodeParamType.String, required: true, label: "The notice. Markdown" }],
} as const satisfies ShortcodeDefinition;

/**
 * Every word of the sponsor form, as a parameter of the shortcode.
 *
 * Derived from the catalogue, as the ladder's own labels are, so a new word
 * and the placeholder a word declares reach the editor's reference without
 * being written a second time.
 */
const SPONSOR_FORM_PARAMS: readonly ShortcodeParamDefinition[] = SPONSOR_FORM_LABEL_KEYS.map((name) => {
  // Widened on the way out, because only one entry declares a placeholder and
  // reading the property off the literal union fails on the others.
  const entry: SponsorFormLabel = SPONSOR_FORM_LABELS[name];
  return {
    name,
    type: ShortcodeParamType.String,
    defaultLabel: entry.value,
    label: `${entry.label}. Plain text`,
    placeholders: entry.placeholders,
  };
});

/**
 * The form that takes what a transfer cannot carry.
 *
 * It belongs under the sponsor variant, because a sponsorship is the one
 * payment here that has to be attributed to a person, and everything the
 * person says about themselves is said in this form rather than in the
 * transfer. Somebody who means to sponsor gives their name, one profile
 * address, their sentence and whether they want to be named, and gets a payment
 * reference back, which the GiroCode and the transfer card then carry in place
 * of the purpose. Every word is optional and falls back to
 * `SPONSOR_FORM_DEFAULTS`.
 */
export const SUPPORT_LADDER_SPONSOR_FORM_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.SponsorForm,
  placement: ShortcodePlacement.Inline,
  label: "Sponsor form",
  description:
    'The form that takes what a sponsor says about themselves and issues a payment reference before the transfer. Belongs inside [[variant key="sponsor"]]. Without this node no form appears.',
  examples: ['[[sponsorform nameLabel="Name" submitLabel="Send details"]]'],
  params: SPONSOR_FORM_PARAMS,
} as const satisfies ShortcodeDefinition;

/**
 * How the transfer card presents itself on one tab.
 *
 * A single payment and a standing order need different wording, so the copy
 * hangs off the block rather than off the tab.
 */
export const SUPPORT_LADDER_VARIANT_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.Variant,
  placement: ShortcodePlacement.Inline,
  label: "Transfer card",
  description:
    "Heading and text of the transfer card on one tab. On once and sponsor the card carries a GiroCode; on monthly it explains the standing order.",
  examples: ['[[variant key="once" title="Bank transfer" text="Arrives without a detour." icon="sepa"]]'],
  params: [
    INTERVAL_KEY_PARAM,
    { name: "title", aliases: ["label"], type: ShortcodeParamType.String, label: "Heading" },
    {
      name: "text",
      aliases: ["description"],
      type: ShortcodeParamType.String,
      label: "Text under the heading. Markdown",
    },
    { name: "recommended", type: ShortcodeParamType.Boolean, label: "Draw it as the suggested route" },
    ICON_PARAM,
  ],
  children: [SUPPORT_LADDER_QRCODE_SHORTCODE, SUPPORT_LADDER_INFO_SHORTCODE, SUPPORT_LADDER_SPONSOR_FORM_SHORTCODE],
} as const satisfies ShortcodeDefinition;

/** One suggested amount, and what that amount pays for. */
export const SUPPORT_LADDER_OPTION_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.Option,
  placement: ShortcodePlacement.Inline,
  label: "Amount",
  description:
    "A suggested amount in euros and what it pays for. With recommended the tab opens on it; without one it opens on the second amount.",
  examples: ['[[option amount={amountMonth} text="Carries a whole month."]]'],
  params: [
    {
      name: "amount",
      type: ShortcodeParamType.String,
      required: true,
      label: "Amount in euros, such as 20 or {amountMonth}",
    },
    { name: "description", aliases: ["text"], type: ShortcodeParamType.String, label: "What it pays for. Markdown" },
    { name: "recommended", type: ShortcodeParamType.Boolean, label: "Open the tab on this amount" },
  ],
} as const satisfies ShortcodeDefinition;

/** The free-amount field of a tab. Without this node the tab offers its suggested amounts only. */
export const SUPPORT_LADDER_CUSTOM_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.Custom,
  placement: ShortcodePlacement.Inline,
  label: "Own amount",
  description: "The field for an amount of the reader's own choosing. Without this node the field is left out.",
  examples: ['[[custom label="Your own amount" placeholder="25"]]'],
  params: [
    { name: "label", aliases: ["title"], type: ShortcodeParamType.String, label: "Heading" },
    {
      name: "placeholder",
      type: ShortcodeParamType.String,
      label: "What the empty field shows. The sponsor tab shows the sponsor minimum instead",
    },
    { name: "text", type: ShortcodeParamType.String, label: "Text under the field. Markdown" },
  ],
} as const satisfies ShortcodeDefinition;

/** The transfer block, with one presentation per tab. */
export const SUPPORT_LADDER_BANK_ACCOUNT_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.BankAccount,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Children,
  label: "Transfer block",
  description:
    "The transfer block. Payee, IBAN and BIC come from Sponsoring, then Settings, and not from here. It holds one variant per tab.",
  examples: ['[[bankaccount\n  [[variant key="once" title="Bank transfer"]]\n]]'],
  params: [
    {
      name: "purposeDonation",
      aliases: ["purpose"],
      type: ShortcodeParamType.String,
      defaultLabel: "the donation purpose under Sponsoring, then Settings",
      label: "What a donation transfer says",
    },
    {
      name: "purposeSponsor",
      type: ShortcodeParamType.String,
      defaultLabel: "the sponsorship purpose under Sponsoring, then Settings",
      label: "What a transfer at or above the sponsor minimum says",
    },
  ],
  children: [SUPPORT_LADDER_VARIANT_SHORTCODE],
} as const satisfies ShortcodeDefinition;

/** One tab, with the amounts it offers. */
export const SUPPORT_LADDER_INTERVAL_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.Interval,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Children,
  label: "Tab",
  description:
    "One tab of the ladder: once, monthly or sponsor. It holds option and custom. The sponsor tab needs no option and shows the free field alone.",
  examples: [
    '[[interval key="once" label="Once" text="A single payment."\n  [[option amount=20]]\n]]',
    '[[interval key="sponsor" label="Become a sponsor" belowMinimum="Below {min} this is a donation."\n  [[custom label="Your amount"]]\n]]',
  ],
  params: [
    INTERVAL_KEY_PARAM,
    { name: "label", aliases: ["title"], type: ShortcodeParamType.String, label: "The tab's name" },
    {
      name: "text",
      aliases: ["description"],
      type: ShortcodeParamType.String,
      label: "What the tab is. Markdown. {annualAmount} stands for what the chosen amount gives over a year",
    },
    { name: "hint", type: ShortcodeParamType.String, label: "A notice on the tab. Markdown" },
    {
      name: "belowMinimum",
      type: ShortcodeParamType.String,
      label: "What the sponsor tab says below the sponsor minimum. Markdown. {min} stands for the minimum",
    },
  ],
  children: [SUPPORT_LADDER_OPTION_SHORTCODE, SUPPORT_LADDER_CUSTOM_SHORTCODE],
} as const satisfies ShortcodeDefinition;

/** The parameters a route out of the page takes. */
const ROUTE_PARAMS: readonly ShortcodeParamDefinition[] = [
  { name: "url", type: ShortcodeParamType.String, required: true, label: "Address" },
  { name: "title", type: ShortcodeParamType.String, label: "Heading" },
  {
    name: "text",
    aliases: ["description"],
    type: ShortcodeParamType.String,
    label: "Text under the heading. Markdown",
  },
  { name: "hint", type: ShortcodeParamType.String, label: "A notice before the button. Markdown" },
  { name: "button", type: ShortcodeParamType.String, label: "The button's text" },
  ICON_PARAM,
];

/**
 * The GitHub Sponsors route.
 *
 * Shown on the single and the monthly tab, because it is the one route here
 * that carries a real subscription the sponsor starts and ends themselves.
 */
export const SUPPORT_LADDER_GITHUB_SPONSORS_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.GhSponsor,
  placement: ShortcodePlacement.Block,
  label: "GitHub Sponsors",
  description:
    "The GitHub Sponsors route, on the once and the monthly tab. The address must be a github.com/sponsors/ page.",
  examples: ['[[ghsponsor url="https://github.com/sponsors/phranck" title="GitHub Sponsors" icon="github"]]'],
  params: ROUTE_PARAMS,
} as const satisfies ShortcodeDefinition;

/** The PayPal.Me route, on the single-payment tab only. */
export const SUPPORT_LADDER_PAYPAL_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.PaypalMe,
  placement: ShortcodePlacement.Block,
  label: "PayPal",
  description: "The PayPal.Me route, on the once tab only. The address must be on paypal.me or paypal.com.",
  examples: [
    '[[paypalme url="https://paypal.me/…" title="PayPal" icon="paypal"\n  hint="Write **{purposePaypal}** in the note, so the payment reaches musiccloud."]]',
  ],
  params: ROUTE_PARAMS,
} as const satisfies ShortcodeDefinition;

/**
 * Every word the ladder itself shows, as a parameter of the shortcode.
 *
 * Derived from the catalogue, so a new label reaches the editor's reference
 * without being written a second time.
 */
const SUPPORT_LADDER_LABEL_PARAMS: readonly ShortcodeParamDefinition[] = SUPPORT_LADDER_LABEL_KEYS.map((name) => ({
  name,
  type: ShortcodeParamType.String,
  defaultLabel: SUPPORT_LADDER_LABELS[name].value,
  label: SUPPORT_LADDER_LABELS[name].label,
}));

/** Written out once, because it is both the documentation and the editor's example. */
const SUPPORT_LADDER_EXAMPLE = [
  "[[support-ladder",
  "  [[bankaccount",
  '    [[variant key="once" title="Bank transfer or GiroCode" text="Arrives without a detour." icon="sepa"]]',
  '    [[variant key="monthly" title="Set up a standing order" text="Runs between the banks."]]',
  '    [[variant key="sponsor" title="Bank transfer or GiroCode" icon="sepa"',
  "      [[sponsorform]]",
  "    ]]",
  "  ]]",
  '  [[interval key="once" label="Once" text="A single payment."',
  '    [[option amount={amountMonthHalf} text="Half a month."]]',
  '    [[option amount={amountMonth} text="A whole month." recommended]]',
  '    [[custom label="Your own amount"]]',
  "  ]]",
  '  [[interval key="monthly" label="Monthly" text="{annualAmount} a year."',
  "    [[option amount={amountMonthQuarter}]]",
  "  ]]",
  '  [[interval key="sponsor" label="Become a sponsor"',
  '    [[custom label="Your amount"]]',
  "  ]]",
  '  [[paypalme url="https://paypal.me/…" title="PayPal" icon="paypal"]]',
  "]]",
].join("\n");

/** The giving block of the support page, with every route it offers. */
export const SUPPORT_LADDER_SHORTCODE = {
  ...LADDER_PART,
  token: ShortcodeToken.SupportLadder,
  placement: ShortcodePlacement.Block,
  body: ShortcodeBodyRule.Children,
  label: "Support ladder",
  description:
    "The giving block of the support page: tabs with amounts, the transfer with its GiroCode, and the PayPal.Me and GitHub Sponsors routes. It holds bankaccount, interval, paypalme and ghsponsor. Write amounts with the sponsoring variables, so they follow the running costs.",
  examples: [SUPPORT_LADDER_EXAMPLE],
  params: SUPPORT_LADDER_LABEL_PARAMS,
  children: [
    SUPPORT_LADDER_BANK_ACCOUNT_SHORTCODE,
    SUPPORT_LADDER_INTERVAL_SHORTCODE,
    SUPPORT_LADDER_PAYPAL_SHORTCODE,
    SUPPORT_LADDER_GITHUB_SPONSORS_SHORTCODE,
  ],
} as const satisfies ShortcodeDefinition;
