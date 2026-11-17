/**
 * @file The sponsor wall as it travels from the backend to the site.
 *
 * The backend reads `[[sponsors]]`, renders its texts as Markdown and writes
 * them as one JSON value into the {@link SPONSOR_WALL_ATTRIBUTE} of an empty
 * element. The site mounts the wall there and fills it with the sponsors it
 * reads from `GET /api/v1/sponsors`, because who is on the wall and how many
 * days each has left change daily and must not be baked into a page.
 *
 * Markdown passes raw HTML through, so a page could write the attribute by
 * hand. The sanitizer and the site therefore both read it through
 * {@link readSponsorWallConfig}, which keeps only strings of the expected
 * length, and the sanitizer runs every HTML field through the page's
 * allowlist with {@link mapSponsorWallHtml}.
 */

import { SUPPORT_LADDER_LIMITS } from "./support-ladder.js";

/** The attribute that carries the wall's texts: `data-mc-sponsor-wall`. */
export const SPONSOR_WALL_ATTRIBUTE = "data-mc-sponsor-wall";

/** The placeholder a `missing` text writes where the amount still outstanding goes. */
export const SPONSOR_WALL_MISSING_PLACEHOLDER = "{missing}";

/**
 * The wall's texts, as the backend rendered them.
 *
 * Every field is optional on the page; an empty one stands for the site's default.
 *
 * @property text - How the block is introduced, rendered Markdown.
 * @property covered - What it says once the year's costs are covered, rendered Markdown.
 * @property missing - What it says while they are not, rendered Markdown, where
 *   {@link SPONSOR_WALL_MISSING_PLACEHOLDER} stands for the amount still outstanding.
 * @property empty - What stands in the row's place while nobody is on it, rendered
 *   Markdown. Its first paragraph is drawn as the placeholder card's headline.
 * @property emptyAction - The placeholder button's label, plain text.
 */
export interface SponsorWallConfig {
  text: string;
  covered: string;
  missing: string;
  empty: string;
  emptyAction: string;
}

/**
 * What the wall says where the page says nothing, as rendered HTML, translated
 * from lmaa.space's defaults.
 *
 * - `text`: empty, so the block is introduced by the page's own heading.
 * - `covered` and `missing`: the sentence under the cards.
 * - `empty`: two paragraphs, because the placeholder card draws the first as its
 *   headline; the second says what a sponsor gets, which answers "why me".
 * - `emptyAction`: the placeholder button's label.
 */
export const SPONSOR_WALL_DEFAULTS: SponsorWallConfig = {
  text: "",
  covered: "<p>This year's running costs are covered. Every further contribution goes into the work on musiccloud.</p>",
  missing: `<p>${SPONSOR_WALL_MISSING_PLACEHOLDER} to go until this year's running costs are covered.</p>`,
  empty:
    "<p><strong>This place is yours.</strong></p><p>Whoever carries the running costs first stands here, with picture, name and a sentence of their own, for a year from the day the transfer arrives.</p>",
  emptyAction: "Become the first sponsor",
};

/** The fields of {@link SponsorWallConfig} that hold rendered HTML, so the sanitizer reaches every one. */
const SPONSOR_WALL_HTML_KEYS = ["text", "covered", "missing", "empty"] as const;

/** The longest each field may be: rendered HTML as long as a ladder text, a label as long as a ladder label. */
const FIELD_MAX_LENGTH: Readonly<Record<keyof SponsorWallConfig, number>> = {
  text: SUPPORT_LADDER_LIMITS.maxHtmlLength,
  covered: SUPPORT_LADDER_LIMITS.maxHtmlLength,
  missing: SUPPORT_LADDER_LIMITS.maxHtmlLength,
  empty: SUPPORT_LADDER_LIMITS.maxHtmlLength,
  emptyAction: SUPPORT_LADDER_LIMITS.maxLabelLength,
};

/**
 * Reads a wall configuration from untrusted input.
 *
 * @param raw - Whatever stood in the attribute, already parsed as JSON.
 * @returns The configuration with every field a string within its length, a
 *   missing or malformed field read as empty, or `null` when `raw` is not an object.
 */
export function readSponsorWallConfig(raw: unknown): SponsorWallConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const field = (key: keyof SponsorWallConfig): string => {
    const value = source[key];
    return typeof value === "string" && value.length <= FIELD_MAX_LENGTH[key] ? value : "";
  };
  return {
    text: field("text"),
    covered: field("covered"),
    missing: field("missing"),
    empty: field("empty"),
    emptyAction: field("emptyAction"),
  };
}

/**
 * Reads the wall's attribute.
 *
 * @param text - The attribute's value.
 * @returns The configuration, or `null` when it is not a JSON object.
 */
export function parseSponsorWallAttribute(text: string): SponsorWallConfig | null {
  try {
    return readSponsorWallConfig(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Rewrites every HTML field of a configuration, such as through the sanitizer.
 *
 * @param config - The configuration.
 * @param mapHtml - What to do with each HTML field.
 * @returns A new configuration; `emptyAction`, which is plain text, is kept as it is.
 */
export function mapSponsorWallHtml(config: SponsorWallConfig, mapHtml: (html: string) => string): SponsorWallConfig {
  const mapped = { ...config };
  for (const key of SPONSOR_WALL_HTML_KEYS) mapped[key] = mapHtml(config[key]);
  return mapped;
}
