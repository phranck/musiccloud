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

/**
 * What every variable is called and what it says.
 *
 * The label is what the editor's reference shows somebody looking for the
 * name, so it is written for them rather than for whoever implements it. The
 * example is what a plausible value looks like, so the list can be read without
 * a running system behind it.
 */
export const SITE_VARIABLES = {
  freeRequestsPerMinute: {
    label: "Requests a minute on the free plan, as the plan is configured",
    example: "60",
  },
  freeRequestsPerDay: {
    label: "Requests a day on the free plan, as the plan is configured",
    example: "10,000",
  },
  projectsPerAccount: {
    label: "How many projects one account may hold, as set in the dashboard",
    example: "3",
  },
  registrationsPerProject: {
    label: "How many registrations one project may hold",
    example: "5",
  },
  keylessRequestsPerMinute: {
    label: "Requests a minute the keyless resolve endpoint allows, per client",
    example: "10",
  },
  keylessRequestsPerDay: {
    label: "Requests a day the keyless resolve endpoint allows, per client",
    example: "500",
  },
} as const satisfies Record<string, { label: string; example: string }>;

/** The name of one variable. */
export type SiteVariableName = keyof typeof SITE_VARIABLES;

/** Every variable, in declaration order. */
export const SITE_VARIABLE_NAMES = Object.keys(SITE_VARIABLES) as SiteVariableName[];

/**
 * The figures a page may name, each read from the one place that owns it.
 *
 * Every one of these is a number somebody can change without touching a page,
 * which is the reason a page names it rather than stating it.
 *
 * @property freeRequestsPerMinute - The free plan's minute limit, from the tier.
 * @property freeRequestsPerDay - The free plan's daily limit, from the tier.
 * @property projectsPerAccount - The per-account ceiling, from the settings.
 * @property registrationsPerProject - What a project may hold, from the route
 *   that enforces it.
 * @property keylessRequestsPerMinute - The keyless budget's minute limit.
 * @property keylessRequestsPerDay - The keyless budget's daily limit.
 */
export interface SiteVariableValues {
  freeRequestsPerMinute: number;
  freeRequestsPerDay: number;
  projectsPerAccount: number;
  registrationsPerProject: number;
  keylessRequestsPerMinute: number;
  keylessRequestsPerDay: number;
}

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
 * Writes a figure the way a sentence carries it.
 *
 * Grouped, because these run to five digits and a reader takes `10,000` in at a
 * glance where they have to count `10000`.
 *
 * @param value - The figure.
 * @returns The figure with its thousands separated.
 */
function formatFigure(value: number): string {
  return value.toLocaleString(NUMBER_LOCALE);
}

/**
 * Puts the figures in place of their names.
 *
 * Run before the page is parsed, so a variable works anywhere a person can
 * type: in prose, in a heading, and inside a shortcode's attribute alike.
 *
 * @param text - What was written, with or without variables in it.
 * @param values - The figures, each already read from the place that owns it.
 * @returns The text with every known variable replaced. Anything else stands
 *   exactly as it was written.
 */
export function expandSiteVariables(text: string, values: SiteVariableValues): string {
  // Nothing to do for the great majority of pages, and this runs on every
  // render of every one of them.
  if (!text.includes("{")) return text;

  return text.replace(VARIABLE_PATTERN, (_match, name: SiteVariableName) => formatFigure(values[name]));
}
