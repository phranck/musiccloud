/**
 * @file Renders `[[sponsors]]` as a marker the site mounts the sponsor wall on.
 *
 * The wall shows who carries this year, and that changes by the day, so the
 * backend does not draw it. It renders the texts the page gave as Markdown and
 * writes them as one JSON value into an empty element; the site reads the
 * sponsors themselves from the public sponsors route and draws the wall there,
 * as it does for the support ladder.
 */

import {
  mapSponsorWallHtml,
  parseShortcodes,
  readShortcodeAt,
  SPONSOR_WALL_ATTRIBUTE,
  SPONSORS_SHORTCODE,
  type SponsorWallConfig,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import { escapeHtml } from "../../lib/html.js";
import { shortcodeText } from "./shortcode-text.js";

/** What the tokenizer hands the renderer. */
interface McSponsorsToken extends Tokens.Generic {
  type: "mcSponsors";
  /** The texts, with each Markdown field replaced by its index into `texts`, or empty for none. */
  config: SponsorWallConfig;
  /** Every Markdown field, lexed. */
  texts: Token[][];
}

/**
 * The wall as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createSponsorsExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcSponsors",
        level: "block",
        start(source: string) {
          return source.match(/\[\[sponsors[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== SPONSORS_SHORTCODE.token) return;

          const [wall] = parseShortcodes(node.source.raw, [SPONSORS_SHORTCODE]);
          const params = wall?.params ?? {};
          const written: SponsorWallConfig = {
            text: shortcodeText(params.text),
            covered: shortcodeText(params.covered),
            missing: shortcodeText(params.missing),
            empty: shortcodeText(params.empty),
            emptyAction: shortcodeText(params.emptyAction),
          };

          // Each Markdown field is lexed here and rendered by the renderer,
          // because marked fills a block's inline tokens only once the whole
          // document is lexed. The field keeps its index into `texts` until then.
          const texts: Token[][] = [];
          const config = mapSponsorWallHtml(written, (markdown) => {
            if (!markdown) return "";
            texts.push(this.lexer.blockTokens(markdown) as Token[]);
            return String(texts.length - 1);
          });

          return { type: "mcSponsors", raw: node.source.raw, config, texts } satisfies McSponsorsToken;
        },
        renderer(token) {
          const wall = token as McSponsorsToken;
          const config = mapSponsorWallHtml(wall.config, (index) =>
            index === "" ? "" : this.parser.parse(wall.texts[Number(index)] ?? []),
          );
          return `<div ${SPONSOR_WALL_ATTRIBUTE}="${escapeHtml(JSON.stringify(config))}"></div>\n`;
        },
      },
    ],
  };
}
