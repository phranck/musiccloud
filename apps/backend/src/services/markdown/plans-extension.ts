/**
 * @file Renders `[[plans]]` as a placeholder for the portal to fill.
 *
 * Every other shortcode here becomes finished markup. This one cannot: the plan
 * list is fetched where the page is served, carries components the backend does
 * not have, and answers to a switch the reader operates. So what the backend
 * emits is an empty element saying where the plans go, and the portal puts the
 * real thing there.
 *
 * That is the whole of `renderMode: Island`. The backend decides the position;
 * whoever serves the page decides what appears.
 */

import { PLANS_PLACEHOLDER_ATTRIBUTE, PLANS_SHORTCODE, readShortcodeAt } from "@musiccloud/shared";
import type { MarkedExtension, Tokens } from "marked";

interface McPlansToken extends Tokens.Generic {
  type: "mcPlans";
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

          return { type: "mcPlans", raw: node.source.raw } satisfies McPlansToken;
        },
        renderer() {
          // Empty, and carrying nothing but the marker. Anything inside it would
          // be shown for as long as it takes the portal to replace it, and a
          // plan list that flashes something else first is worse than one that
          // simply appears.
          return `<div ${PLANS_PLACEHOLDER_ATTRIBUTE}></div>\n`;
        },
      },
    ],
  };
}
