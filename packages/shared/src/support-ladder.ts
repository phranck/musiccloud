/**
 * @file The support ladder as it travels from the backend to the site.
 *
 * The backend reads the `[[support-ladder]]` tree of a page, renders its texts
 * and writes the result as one JSON value into the
 * {@link SUPPORT_LADDER_ATTRIBUTE} of an empty element. The site mounts the
 * ladder on that element.
 *
 * Markdown passes raw HTML through, so a page could write that attribute by
 * hand. Nothing downstream therefore trusts it because of where it came from:
 * the sanitizer and the site both read it through
 * {@link readSupportLadderConfig}, which keeps only what fits the shape below,
 * and the sanitizer runs every text field through the page's own allowlist
 * with {@link mapSupportLadderHtml}.
 */

import { DONATION_LIMITS } from "./donations.js";
import { isSameSiteRelativePath } from "./safe-url.js";
import { SPONSOR_FORM_LABEL_KEYS, type SponsorFormTexts } from "./sponsor-form.js";
import { SPONSORING_LIMITS } from "./sponsoring.js";

/** The attribute that carries the ladder's configuration: `data-mc-support-ladder`. */
export const SUPPORT_LADDER_ATTRIBUTE = "data-mc-support-ladder";

/**
 * The name of the placeholder a tab's `text` accepts for the yearly total of
 * the chosen amount: `annualAmount`, written `{annualAmount}`. The site
 * replaces it, and the `[[interval]]` shortcode declares it.
 */
export const SUPPORT_LADDER_YEARLY_TOTAL_PLACEHOLDER_NAME = "annualAmount";

/**
 * The name of the placeholder a tab's `belowMinimum` accepts for the sponsor
 * minimum: `min`, written `{min}`. The site replaces it, and the `[[interval]]`
 * shortcode declares it.
 */
export const SUPPORT_LADDER_MINIMUM_PLACEHOLDER_NAME = "min";

/**
 * What one tab of the ladder stands for.
 *
 * - `Once`: a single payment, with a GiroCode.
 * - `Monthly`: a standing order, which a GiroCode cannot express.
 * - `Sponsor`: a year's sponsorship, paid once and by transfer alone.
 */
export const SupportIntervalKey = {
  Once: "once",
  Monthly: "monthly",
  Sponsor: "sponsor",
} as const;

/** A {@link SupportIntervalKey} member value. */
export type SupportIntervalKeyValue = (typeof SupportIntervalKey)[keyof typeof SupportIntervalKey];

/** Every tab key, in the order a page usually names them. */
export const SUPPORT_INTERVAL_KEYS: readonly SupportIntervalKeyValue[] = Object.values(SupportIntervalKey);

/**
 * The routes out of the page.
 *
 * - `PaypalMe`: PayPal.Me, shown on the single-payment tab only.
 * - `GithubSponsors`: GitHub Sponsors, shown on the single and the monthly tab,
 *   because it is the one route here that carries a real subscription.
 */
export const SupportRouteToken = {
  PaypalMe: "paypalme",
  GithubSponsors: "ghsponsor",
} as const;

/** A {@link SupportRouteToken} member value. */
export type SupportRouteTokenValue = (typeof SupportRouteToken)[keyof typeof SupportRouteToken];

/**
 * The brand marks a payment card may show beside its heading.
 *
 * - `Sepa`: the SEPA lockup, for the transfer card.
 * - `Paypal`: the PayPal lockup.
 * - `Github`: the GitHub lockup.
 */
export const SupportBrandIcon = {
  Sepa: "sepa",
  Paypal: "paypal",
  Github: "github",
} as const;

/** A {@link SupportBrandIcon} member value. */
export type SupportBrandIconValue = (typeof SupportBrandIcon)[keyof typeof SupportBrandIcon];

/** The shapes a GiroCode's dots may take, as the QR renderer names them. */
export const SUPPORT_QR_DOT_TYPES = ["square", "dots", "rounded", "classy", "classy-rounded", "extra-rounded"] as const;

/** The shapes a GiroCode's corner marks may take, as the QR renderer names them. */
export const SUPPORT_QR_CORNER_TYPES = [
  "square",
  "dot",
  "extra-rounded",
  "dots",
  "rounded",
  "classy",
  "classy-rounded",
] as const;

/**
 * Bounds on everything a ladder may carry.
 *
 * The shortcode definitions declare the same integer ranges, and the reader
 * enforces all of them, so a value the editor accepts is one the site draws.
 */
export const SUPPORT_LADDER_LIMITS = {
  /** Most suggested amounts one tab offers: 8. */
  maxOptions: 8,
  /** Most routes out of the page: 4. */
  maxRoutes: 4,
  /** Longest rendered text field, in characters of HTML: 4,000. */
  maxHtmlLength: 4_000,
  /** Longest plain label, heading or button text: 160 characters. */
  maxLabelLength: 160,
  /** Longest address: 2,048 characters. */
  maxUrlLength: 2_048,
  /** Smallest GiroCode edge in pixels: 96. */
  qrMinSize: 96,
  /** Largest GiroCode edge in pixels: 512. */
  qrMaxSize: 512,
  /** Smallest quiet zone in pixels: 0. */
  qrMinMargin: 0,
  /** Largest quiet zone in pixels: 64. */
  qrMaxMargin: 64,
  /** Largest amount one option or the sponsor minimum may name, in euros: the ledger's largest donation. */
  maxAmountEur: DONATION_LIMITS.amountMaxCents / 100,
} as const;

/**
 * The words the ladder itself puts on screen, each with the wording it uses
 * when the shortcode names nothing. The shortcode's parameter list is derived
 * from these entries, so a new label is added in one place.
 */
export const SUPPORT_LADDER_LABELS = {
  frequencyGroup: { value: "How often", label: "Spoken name of the tab switch" },
  perMonth: { value: "a month", label: "What follows a monthly amount" },
  qrAlt: { value: "GiroCode to scan with a banking app", label: "Spoken name of the GiroCode" },
  fieldName: { value: "Payee", label: "Label of the payee line" },
  fieldIban: { value: "IBAN", label: "Label of the IBAN line" },
  fieldBic: { value: "BIC", label: "Label of the BIC line" },
  fieldPurpose: { value: "Purpose", label: "Label of the purpose line" },
  fieldAmount: { value: "Amount", label: "Label of the amount line" },
  fieldReference: { value: "Reference", label: "Label of the payment reference line on the sponsor tab" },
  referenceMissing: {
    value: "Your payment reference appears here once you have sent your details above.",
    label: "Spoken name of the reference line before a reference is issued",
  },
  amountOpen: { value: "your choice", label: "What the amount line says while no amount is chosen" },
} as const satisfies Record<string, { value: string; label: string }>;

/** The name of one overridable label. */
export type SupportLadderLabelKey = keyof typeof SUPPORT_LADDER_LABELS;

/** Every overridable label name, in declaration order. */
export const SUPPORT_LADDER_LABEL_KEYS = Object.keys(SUPPORT_LADDER_LABELS) as SupportLadderLabelKey[];

/** The wording used where the shortcode names no override. */
export const SUPPORT_LADDER_LABEL_DEFAULTS = Object.fromEntries(
  SUPPORT_LADDER_LABEL_KEYS.map((key) => [key, SUPPORT_LADDER_LABELS[key].value]),
) as Record<SupportLadderLabelKey, string>;

/**
 * One suggested amount.
 *
 * @property amountEur - The amount in euros, above 0 and at most {@link SUPPORT_LADDER_LIMITS.maxAmountEur}.
 * @property description - What it pays for, as rendered HTML. May be empty.
 * @property recommended - Whether the tab opens on it. At most one option of a tab is.
 */
export interface SupportLadderOption {
  amountEur: number;
  description: string;
  recommended: boolean;
}

/**
 * The free-amount field of a tab.
 *
 * @property label - Its heading, plain text.
 * @property placeholder - What the empty field shows, plain text.
 * @property text - A sentence under it, as rendered HTML. May be empty.
 */
export interface SupportLadderCustom {
  label: string;
  placeholder: string;
  text: string;
}

/**
 * One tab and the amounts it offers.
 *
 * @property key - Which tab it is. Unique within a ladder.
 * @property label - The tab's name, plain text.
 * @property text - What the tab is, as rendered HTML. `{annualAmount}` stands
 *   for what the chosen amount gives over a year.
 * @property hint - A notice, as rendered HTML. Empty when the page names none.
 * @property belowMinimum - What the sponsor tab says below the minimum, as
 *   rendered HTML. `{min}` stands for the minimum. Empty when the page names none.
 * @property options - The suggested amounts, in order.
 * @property custom - The free-amount field, `null` when the tab has none.
 */
export interface SupportLadderInterval {
  key: SupportIntervalKeyValue;
  label: string;
  text: string;
  hint: string;
  belowMinimum: string;
  options: SupportLadderOption[];
  custom: SupportLadderCustom | null;
}

/**
 * How the GiroCode looks. Every field is optional, so a page names only what
 * it changes and the site keeps its own value for the rest.
 *
 * @property color - The dots' color, a hex value.
 * @property background - The quiet zone's color, a hex value.
 * @property size - The code's edge in pixels, within the {@link SUPPORT_LADDER_LIMITS} QR bounds.
 * @property margin - The quiet zone in pixels, within the same bounds.
 * @property dots - One of {@link SUPPORT_QR_DOT_TYPES}.
 * @property corners - One of {@link SUPPORT_QR_CORNER_TYPES}.
 * @property image - A picture in the middle, as a path on this site.
 */
export interface SupportLadderQrStyle {
  color?: string;
  background?: string;
  size?: number;
  margin?: number;
  dots?: (typeof SUPPORT_QR_DOT_TYPES)[number];
  corners?: (typeof SUPPORT_QR_CORNER_TYPES)[number];
  image?: string;
}

/**
 * How the transfer card presents itself on one tab.
 *
 * @property key - The tab it belongs to.
 * @property title - Its heading, plain text.
 * @property text - What it says under the heading, as rendered HTML.
 * @property recommended - Whether it is drawn as the suggested route.
 * @property icon - The brand mark beside the heading, if any.
 * @property qr - How the GiroCode looks, if the page says.
 * @property info - A notice under the payee lines, as rendered HTML. Empty when none.
 * @property sponsorForm - The page's wording for the sponsor form, as plain
 *   text, when this variant carries one. `null` when the variant names no
 *   `[[sponsorform]]`, which leaves the form out, and that is what every
 *   variant but the sponsor one wants.
 */
export interface SupportLadderVariant {
  key: SupportIntervalKeyValue;
  title: string;
  text: string;
  recommended: boolean;
  icon?: SupportBrandIconValue;
  qr?: SupportLadderQrStyle;
  info: string;
  sponsorForm: SponsorFormTexts | null;
}

/**
 * The transfer block.
 *
 * @property purposeDonation - What a donation transfer says. The sponsoring
 *   settings' purpose where the page names none.
 * @property purposeSponsor - What a transfer at or above the sponsor minimum
 *   says. The sponsoring settings' purpose where the page names none.
 * @property variants - One presentation per tab.
 */
export interface SupportLadderBankAccount {
  purposeDonation: string;
  purposeSponsor: string;
  variants: SupportLadderVariant[];
}

/**
 * A route out of the page.
 *
 * @property token - Which route it is, which decides the tabs it shows on.
 * @property url - Where it leads, an `https` address on the route's own host.
 * @property title - Its heading, plain text.
 * @property text - What it says, as rendered HTML.
 * @property hint - A notice before the button, as rendered HTML. Empty when none.
 * @property button - The button's text, plain text.
 * @property icon - The brand mark beside the heading, if any.
 */
export interface SupportLadderRoute {
  token: SupportRouteTokenValue;
  url: string;
  title: string;
  text: string;
  hint: string;
  button: string;
  icon?: SupportBrandIconValue;
}

/**
 * Who is paid, from the sponsoring settings rather than from the page.
 *
 * @property name - The account holder.
 * @property iban - The account, without spaces.
 * @property bic - The bank, without spaces. May be empty.
 */
export interface SupportLadderPayee {
  name: string;
  iban: string;
  bic: string;
}

/**
 * Everything the site needs to draw the ladder.
 *
 * @property intervals - The tabs, in the order the page names them. At least one.
 * @property bankAccount - The transfer block, `null` when the page names none.
 * @property routes - The routes out, in document order.
 * @property payee - Who is paid. Empty fields mean no transfer card is drawn.
 * @property minSponsorAmountEur - The sponsor minimum in euros, from the settings.
 * @property labels - The page's wording overrides, plain text.
 */
export interface SupportLadderConfig {
  intervals: SupportLadderInterval[];
  bankAccount: SupportLadderBankAccount | null;
  routes: SupportLadderRoute[];
  payee: SupportLadderPayee;
  minSponsorAmountEur: number;
  labels: Partial<Record<SupportLadderLabelKey, string>>;
}

/** A GiroCode color: a hex value of 3, 4, 6 or 8 digits. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The hosts a PayPal.Me card may lead to. */
const PAYPAL_HOSTS = new Set(["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"]);

/** The host a GitHub Sponsors card leads to. */
const GITHUB_HOST = "github.com";

/** The path every GitHub Sponsors page starts with. */
const GITHUB_SPONSORS_PATH = "/sponsors/";

/** An IBAN without spaces, as the transfer card prints and the GiroCode carries it. */
const PAYEE_IBAN_PATTERN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

/** A BIC without spaces, or empty. */
const PAYEE_BIC_PATTERN = /^(?:[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)?$/;

/**
 * Whether an address is one a route's card may lead to.
 *
 * @param token - The route.
 * @param url - The address as written.
 * @returns `true` for an `https` address on the route's own host; for GitHub
 *   Sponsors, also under its sponsors path.
 */
export function isAllowedSupportRouteUrl(token: SupportRouteTokenValue, url: string): boolean {
  if (url.length > SUPPORT_LADDER_LIMITS.maxUrlLength) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  if (token === SupportRouteToken.PaypalMe) return PAYPAL_HOSTS.has(host);
  return host === GITHUB_HOST && parsed.pathname.startsWith(GITHUB_SPONSORS_PATH);
}

/** A plain object, as `JSON.parse` returns one. */
type JsonObject = Record<string, unknown>;

/**
 * Whether a value is a plain object.
 *
 * @param value - Anything.
 * @returns `true` for an object that is neither `null` nor an array.
 */
function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a string field, bounded in length.
 *
 * @param value - The field.
 * @param maxLength - The longest value kept.
 * @returns The string, or `null` when it is not one or is too long.
 */
function readString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

/**
 * Reads an amount in euros.
 *
 * @param value - The field.
 * @returns The amount, or `null` when it is not a finite number above 0 and at
 *   most {@link SUPPORT_LADDER_LIMITS.maxAmountEur}.
 */
function readAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= SUPPORT_LADDER_LIMITS.maxAmountEur
    ? value
    : null;
}

/**
 * Reads an integer inside bounds.
 *
 * @param value - The field.
 * @param min - The smallest value kept.
 * @param max - The largest value kept.
 * @returns The integer, or `undefined` when it is absent or out of bounds.
 */
function readBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * Reads a value that must be one of a list.
 *
 * @param value - The field.
 * @param allowed - The values kept.
 * @returns The value, or `undefined` when it is none of them.
 */
function readMember<Value extends string>(value: unknown, allowed: readonly Value[]): Value | undefined {
  return allowed.find((member) => member === value);
}

/**
 * Reads a rendered text field.
 *
 * @param value - The field.
 * @returns The HTML, or empty when it is absent, not a string, or longer than
 *   {@link SUPPORT_LADDER_LIMITS.maxHtmlLength}.
 */
function readHtml(value: unknown): string {
  return readString(value, SUPPORT_LADDER_LIMITS.maxHtmlLength) ?? "";
}

/**
 * Reads a plain label, heading or button text.
 *
 * @param value - The field.
 * @returns The text, or empty when it is absent, not a string, or longer than
 *   {@link SUPPORT_LADDER_LIMITS.maxLabelLength}.
 */
function readLabel(value: unknown): string {
  return readString(value, SUPPORT_LADDER_LIMITS.maxLabelLength) ?? "";
}

/**
 * Reads a tab's suggested amounts, keeping the first recommended one only.
 *
 * An amount named twice is kept once, because the site marks the option whose
 * amount is chosen, and two options of one amount would both show as chosen.
 *
 * @param value - The field.
 * @returns The options that fit; an unusable or repeated one is dropped.
 */
function readOptions(value: unknown): SupportLadderOption[] {
  if (!Array.isArray(value)) return [];
  const options: SupportLadderOption[] = [];
  const seen = new Set<number>();
  let recommendedTaken = false;
  for (const entry of value.slice(0, SUPPORT_LADDER_LIMITS.maxOptions)) {
    if (!isObject(entry)) continue;
    const amountEur = readAmount(entry.amountEur);
    if (amountEur === null || seen.has(amountEur)) continue;
    seen.add(amountEur);
    const recommended = entry.recommended === true && !recommendedTaken;
    if (recommended) recommendedTaken = true;
    options.push({ amountEur, description: readHtml(entry.description), recommended });
  }
  return options;
}

/**
 * Reads the tabs, keeping the first of each key and only tabs that offer something.
 *
 * @param value - The field.
 * @returns The tabs that fit.
 */
function readIntervals(value: unknown): SupportLadderInterval[] {
  if (!Array.isArray(value)) return [];
  const intervals: SupportLadderInterval[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, SUPPORT_INTERVAL_KEYS.length * 2)) {
    if (!isObject(entry)) continue;
    const key = readMember(entry.key, SUPPORT_INTERVAL_KEYS);
    if (!key || seen.has(key)) continue;
    const options = readOptions(entry.options);
    const custom = isObject(entry.custom)
      ? {
          label: readLabel(entry.custom.label),
          placeholder: readLabel(entry.custom.placeholder),
          text: readHtml(entry.custom.text),
        }
      : null;
    if (options.length === 0 && !custom) continue;
    seen.add(key);
    intervals.push({
      key,
      label: readLabel(entry.label),
      text: readHtml(entry.text),
      hint: readHtml(entry.hint),
      belowMinimum: readHtml(entry.belowMinimum),
      options,
      custom,
    });
  }
  return intervals;
}

/**
 * Reads how a GiroCode looks.
 *
 * @param value - The field.
 * @returns The style with every unusable field left out, or `undefined` when absent.
 */
function readQrStyle(value: unknown): SupportLadderQrStyle | undefined {
  if (!isObject(value)) return undefined;
  const color = readString(value.color, SUPPORT_LADDER_LIMITS.maxLabelLength);
  const background = readString(value.background, SUPPORT_LADDER_LIMITS.maxLabelLength);
  const image = readString(value.image, SUPPORT_LADDER_LIMITS.maxUrlLength);
  return {
    color: color && HEX_COLOR_PATTERN.test(color) ? color : undefined,
    background: background && HEX_COLOR_PATTERN.test(background) ? background : undefined,
    size: readBoundedInteger(value.size, SUPPORT_LADDER_LIMITS.qrMinSize, SUPPORT_LADDER_LIMITS.qrMaxSize),
    margin: readBoundedInteger(value.margin, SUPPORT_LADDER_LIMITS.qrMinMargin, SUPPORT_LADDER_LIMITS.qrMaxMargin),
    dots: readMember(value.dots, SUPPORT_QR_DOT_TYPES),
    corners: readMember(value.corners, SUPPORT_QR_CORNER_TYPES),
    image: image && isSameSiteRelativePath(image.trim()) ? image.trim() : undefined,
  };
}

/** Every brand mark, as a list to check a value against. */
const BRAND_ICONS = Object.values(SupportBrandIcon);

/**
 * Reads the transfer block.
 *
 * @param value - The field.
 * @returns The block, or `null` when absent.
 */
function readBankAccount(value: unknown): SupportLadderBankAccount | null {
  if (!isObject(value)) return null;
  const variants: SupportLadderVariant[] = [];
  const seen = new Set<string>();
  let recommendedTaken = false;
  if (Array.isArray(value.variants)) {
    for (const entry of value.variants.slice(0, SUPPORT_INTERVAL_KEYS.length * 2)) {
      if (!isObject(entry)) continue;
      const key = readMember(entry.key, SUPPORT_INTERVAL_KEYS);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const recommended = entry.recommended === true && !recommendedTaken;
      if (recommended) recommendedTaken = true;
      variants.push({
        key,
        title: readLabel(entry.title),
        text: readHtml(entry.text),
        recommended,
        icon: readMember(entry.icon, BRAND_ICONS),
        qr: readQrStyle(entry.qr),
        info: readHtml(entry.info),
        sponsorForm: isObject(entry.sponsorForm) ? readTextOverrides(entry.sponsorForm, SPONSOR_FORM_LABEL_KEYS) : null,
      });
    }
  }
  return {
    purposeDonation: readString(value.purposeDonation, SPONSORING_LIMITS.purposeMaxLength) ?? "",
    purposeSponsor: readString(value.purposeSponsor, SPONSORING_LIMITS.purposeMaxLength) ?? "",
    variants,
  };
}

/** Every route token, as a list to check a value against. */
const ROUTE_TOKENS = Object.values(SupportRouteToken);

/**
 * Reads the routes out, dropping any whose address is not allowed.
 *
 * @param value - The field.
 * @returns The routes that fit, in order.
 */
function readRoutes(value: unknown): SupportLadderRoute[] {
  if (!Array.isArray(value)) return [];
  const routes: SupportLadderRoute[] = [];
  for (const entry of value.slice(0, SUPPORT_LADDER_LIMITS.maxRoutes)) {
    if (!isObject(entry)) continue;
    const token = readMember(entry.token, ROUTE_TOKENS);
    const url = readString(entry.url, SUPPORT_LADDER_LIMITS.maxUrlLength);
    if (!token || !url || !isAllowedSupportRouteUrl(token, url)) continue;
    routes.push({
      token,
      url,
      title: readLabel(entry.title),
      text: readHtml(entry.text),
      hint: readHtml(entry.hint),
      button: readLabel(entry.button),
      icon: readMember(entry.icon, BRAND_ICONS),
    });
  }
  return routes;
}

/**
 * Reads the payee, keeping only fields in the shape a transfer carries.
 *
 * @param value - The field.
 * @returns The payee; a field that does not fit is empty, which leaves the
 *   transfer card out.
 */
function readPayee(value: unknown): SupportLadderPayee {
  const payee = isObject(value) ? value : {};
  const name = readString(payee.name, SPONSORING_LIMITS.payeeNameMaxLength) ?? "";
  const iban = readString(payee.iban, SUPPORT_LADDER_LIMITS.maxLabelLength) ?? "";
  const bic = readString(payee.bic, SUPPORT_LADDER_LIMITS.maxLabelLength) ?? "";
  return {
    name,
    iban: PAYEE_IBAN_PATTERN.test(iban) ? iban : "",
    bic: PAYEE_BIC_PATTERN.test(bic) ? bic : "",
  };
}

/**
 * Reads a set of plain-text wording overrides, such as the ladder's labels or
 * the sponsor form's words.
 *
 * @param value - The field.
 * @param keys - The words that may be overridden; any other key is dropped.
 * @returns The overrides that are non-empty strings of at most
 *   {@link SUPPORT_LADDER_LIMITS.maxLabelLength} characters, trimmed.
 */
function readTextOverrides<Key extends string>(value: unknown, keys: readonly Key[]): Partial<Record<Key, string>> {
  const overrides: Partial<Record<Key, string>> = {};
  if (!isObject(value)) return overrides;
  for (const key of keys) {
    const written = readLabel(value[key]).trim();
    if (written) overrides[key] = written;
  }
  return overrides;
}

/**
 * Reads a ladder's configuration from an untrusted value.
 *
 * Everything that does not fit {@link SupportLadderConfig} is left out rather
 * than refused, so one mistyped option costs that option and not the ladder.
 *
 * @param value - Anything, usually what `JSON.parse` returned.
 * @returns The configuration, or `null` when no tab offers anything to choose.
 */
export function readSupportLadderConfig(value: unknown): SupportLadderConfig | null {
  if (!isObject(value)) return null;
  const intervals = readIntervals(value.intervals);
  if (intervals.length === 0) return null;
  const minimum = readAmount(value.minSponsorAmountEur);
  return {
    intervals,
    bankAccount: readBankAccount(value.bankAccount),
    routes: readRoutes(value.routes),
    payee: readPayee(value.payee),
    minSponsorAmountEur: minimum ?? 0,
    labels: readTextOverrides(value.labels, SUPPORT_LADDER_LABEL_KEYS),
  };
}

/**
 * Parses the attribute's text into a configuration.
 *
 * @param text - The attribute's value.
 * @returns The configuration, or `null` when the text is not JSON or holds no usable ladder.
 */
export function parseSupportLadderAttribute(text: string): SupportLadderConfig | null {
  try {
    return readSupportLadderConfig(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Rewrites every rendered text field of a configuration.
 *
 * The one list of which fields hold HTML, so the sanitizer reaches all of them
 * and a field added later cannot slip past it.
 *
 * @param config - The configuration, as {@link readSupportLadderConfig} returned it.
 * @param rewrite - Applied to every HTML field, such as the page's sanitizer.
 * @returns A new configuration with every HTML field rewritten and every other field unchanged.
 */
export function mapSupportLadderHtml(
  config: SupportLadderConfig,
  rewrite: (html: string) => string,
): SupportLadderConfig {
  return {
    ...config,
    intervals: config.intervals.map((interval) => ({
      ...interval,
      text: rewrite(interval.text),
      hint: rewrite(interval.hint),
      belowMinimum: rewrite(interval.belowMinimum),
      options: interval.options.map((option) => ({ ...option, description: rewrite(option.description) })),
      custom: interval.custom ? { ...interval.custom, text: rewrite(interval.custom.text) } : null,
    })),
    bankAccount: config.bankAccount
      ? {
          ...config.bankAccount,
          variants: config.bankAccount.variants.map((variant) => ({
            ...variant,
            text: rewrite(variant.text),
            info: rewrite(variant.info),
          })),
        }
      : null,
    routes: config.routes.map((route) => ({ ...route, text: rewrite(route.text), hint: rewrite(route.hint) })),
  };
}
