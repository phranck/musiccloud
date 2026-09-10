/**
 * @file Renders `[[plans]]` as a placeholder for the portal to fill.
 *
 * Every other shortcode here becomes finished markup. This one cannot: the plan
 * list is fetched where the page is served, carries components the backend does
 * not have, and answers to a switch the reader operates. So what the backend
 * emits is an empty element saying where the plans go and what heading they
 * carry, and the portal puts the real thing there.
 *
 * That is the whole of `renderMode: Island`. The backend decides the position
 * and the parameters; whoever serves the page decides what appears.
 */

import {
  PLANS_DEFAULT_HEADING,
  PLANS_PLACEHOLDER_ATTRIBUTE,
  PLANS_SHORTCODE,
  parseShortcodes,
  readShortcodeAt,
} from "@musiccloud/shared";
import type { MarkedExtension, Tokens } from "marked";

interface McPlansToken extends Tokens.Generic {
  type: "mcPlans";
  heading: string;
}

/**
 * Escapes a value for a double-quoted HTML attribute.
 *
 * The heading is written by whoever edits the page, so it is untrusted the same
 * way any other attribute value is. The sanitizer downstream would catch what
 * this misses, but a renderer that emits broken markup and relies on something
 * later to repair it is a renderer nobody can reason about.
 *
 * @param value - The heading as written.
 * @returns The same text, safe to put between double quotes.
 */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The plan list as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createPlansExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcPlans",
        level: "block",
        start(source: string) {
          return source.match(/\[\[plans[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== PLANS_SHORTCODE.token) return;

          const [parsed] = parseShortcodes(node.source.raw, [PLANS_SHORTCODE]);
          const heading = parsed?.params.heading;

          return {
            type: "mcPlans",
            raw: node.source.raw,
            heading: typeof heading === "string" ? heading : PLANS_DEFAULT_HEADING,
          } satisfies McPlansToken;
        },
        renderer(token) {
          const plans = token as McPlansToken;
          // Empty on purpose. Anything inside it would be shown for as long as
          // it takes the portal to replace it, and a plan list that flashes
          // something else first is worse than one that simply appears.
          return `<div ${PLANS_PLACEHOLDER_ATTRIBUTE}="${escapeAttribute(plans.heading)}"></div>\n`;
        },
      },
    ],
  };
}
