/**
 * @file Every shortcode a page may use, and the lookup by token.
 */

import type { ContentContextMask } from "../content-context.js";
import { hasAllContextBits } from "../content-context.js";
import { FIELDS_SHORTCODE, KBD_SHORTCODE, PILL_SHORTCODE } from "./content.js";
import { ICON_SHORTCODE } from "./icon.js";
import { CARD_ROW_SHORTCODE, CARD_SHORTCODE } from "./layout.js";
import { IMAGE_SHORTCODE, PDF_SHORTCODE, YOUTUBE_SHORTCODE } from "./media.js";
import { PLANS_SHORTCODE } from "./plans.js";
import { HSTACK_SHORTCODE, SPACER_SHORTCODE, VSTACK_SHORTCODE } from "./stacks.js";
import { type ShortcodeDefinition, ShortcodeSyntax } from "./types.js";

/**
 * Every shortcode, in the order the editor's reference lists them.
 *
 * Sorted by token rather than written out in an order somebody chose, because
 * the reference is a list to look something up in and the token is what a writer
 * has in mind whilst looking. Sorting it here rather than in the reference means
 * a shortcode added to this list cannot land anywhere unexpected.
 */
export const SHORTCODE_DEFINITIONS: readonly ShortcodeDefinition[] = [
  CARD_SHORTCODE,
  CARD_ROW_SHORTCODE,
  VSTACK_SHORTCODE,
  HSTACK_SHORTCODE,
  SPACER_SHORTCODE,
  PLANS_SHORTCODE,
  IMAGE_SHORTCODE,
  YOUTUBE_SHORTCODE,
  PDF_SHORTCODE,
  FIELDS_SHORTCODE,
  ICON_SHORTCODE,
  PILL_SHORTCODE,
  KBD_SHORTCODE,
].sort((first, second) => first.token.localeCompare(second.token));

/**
 * Finds a shortcode by its token.
 *
 * @param token - What was written after `[[` or `:::`.
 * @returns The definition, or `undefined` when nothing claims that token, in
 *   which case the source is left standing as text.
 */
export function getShortcodeDefinition(token: string): ShortcodeDefinition | undefined {
  return SHORTCODE_DEFINITIONS.find((definition) => definition.token === token);
}

/**
 * The shortcodes a page in one content context may use.
 *
 * @param contextMask - Where the page is rendered, as a
 *   {@link ContentContextMask}.
 * @returns Every definition allowed there, in registry order.
 *
 * @remarks
 * A shortcode allowed in both contexts appears for either. One belonging to a
 * single context appears only there, which is what stops the portal's
 * vocabulary from leaking into the site's editor and the other way round.
 */
export function shortcodesForContext(contextMask: ContentContextMask): readonly ShortcodeDefinition[] {
  return SHORTCODE_DEFINITIONS.filter((definition) => hasAllContextBits(definition.allowedContextMask, contextMask));
}

/**
 * Checks that the registry is one somebody can actually write against.
 *
 * Two rules, both of which would otherwise fail as a page rendering the wrong
 * thing rather than as an error. A token claimed twice makes which definition
 * wins depend on the order of this list. And the braces form carries no token
 * at all, so the parser matches it by its notation alone and a second one would
 * be unreachable.
 *
 * @param definitions - The registry to check.
 * @throws RangeError when a token is claimed twice or a second shortcode uses
 *   the braces notation.
 */
export function assertRegistryIsUnambiguous(definitions: readonly ShortcodeDefinition[]): void {
  const seen = new Set<string>();
  let bracesToken: string | undefined;

  for (const definition of definitions) {
    const key = `${definition.syntax}:${definition.token}`;
    if (seen.has(key)) {
      throw new RangeError(`Two shortcodes claim the token "${definition.token}".`);
    }
    seen.add(key);

    if (definition.syntax === ShortcodeSyntax.Braces) {
      if (bracesToken !== undefined) {
        throw new RangeError(
          `"${definition.token}" and "${bracesToken}" both use the {{…}} notation, which carries no token to tell them apart.`,
        );
      }
      bracesToken = definition.token;
    }
  }
}

// Checked as the module loads, so a registry that cannot be written against
// fails the build rather than rendering the wrong shortcode on a page.
assertRegistryIsUnambiguous(SHORTCODE_DEFINITIONS);
