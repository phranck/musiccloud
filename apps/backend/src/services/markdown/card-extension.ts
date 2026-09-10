/**
 * @file Renders the card and card-row shortcodes.
 *
 * These two are the first shortcodes that carry page content rather than
 * drawing one thing from their attributes, which is what makes them different
 * from everything beside them: what stands inside a card is Markdown and is
 * rendered exactly as the page around it, so a card may hold a heading, a code
 * block, a fields list, or another card.
 *
 * The body is lexed and parsed through marked's own lexer, which is what makes
 * that true rather than approximately true. A second Markdown pass with its own
 * rules would render the inside of a card differently from the outside, and the
 * difference would surface as a heading that is not a heading.
 */

import {
  CARD_ROW_SHORTCODE,
  CARD_SHORTCODE,
  parseShortcodes,
  readShortcodeAt,
  type ShortcodeParamValue,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import { insideContainer, isAtContainerLimit, resolveContainerSpacing } from "./containers.js";

/** The class the stylesheet gives one card. */
const CARD_CLASS = "mc-card";

/** The class the stylesheet gives a row of them. */
const CARD_ROW_CLASS = "mc-cards";

interface McCardToken extends Tokens.Generic {
  type: "mcCard";
  tokens: Token[];
}

interface McCardRowToken extends Tokens.Generic {
  type: "mcCardRow";
  tokens: Token[];
  columns: number;
  /** The gap as CSS, or `null` to let the stylesheet decide. */
  spacing: string | null;
}

/**
 * Reads a card shortcode's parameters and its content, if one begins here.
 *
 * @param source - What marked is offering, from the current position.
 * @param token - Which of the two layout shortcodes to look for.
 * @returns The raw source, the content between the braces, and the resolved
 *   parameters, or `null` when the source does not begin with that shortcode.
 */
function readCardSource(
  source: string,
  token: string,
): { raw: string; body: string; params: Record<string, ShortcodeParamValue> } | null {
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== token || node.body === undefined) return null;

  // Through the parser, so the bounds and the defaults the registry declares
  // are the ones that hold here. Reading `node.attributes` directly would be a
  // second answer to what `columns` accepts.
  const definition = token === CARD_SHORTCODE.token ? CARD_SHORTCODE : CARD_ROW_SHORTCODE;
  const [parsed] = parseShortcodes(node.source.raw, [definition]);

  return { raw: node.source.raw, body: node.body, params: parsed?.params ?? {} };
}

/**
 * The card shortcode as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createCardExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcCard",
        level: "block",
        start(source: string) {
          return source.match(/\[\[card[\s{]/)?.index;
        },
        tokenizer(source: string) {
          const read = readCardSource(source, CARD_SHORTCODE.token);
          if (!read) return;

          // A card past the limit is left as text, so the source appears on the
          // page and whoever wrote it can see what happened. Rendering it as a
          // plain card instead would hide a document that nests without end.
          if (isAtContainerLimit()) return;

          return insideContainer(
            () =>
              ({
                type: "mcCard",
                raw: read.raw,
                tokens: this.lexer.blockTokens(read.body) as Token[],
              }) satisfies McCardToken,
          );
        },
        renderer(token) {
          const card = token as McCardToken;
          return `<div class="${CARD_CLASS}">${this.parser.parse(card.tokens)}</div>\n`;
        },
      },
      {
        name: "mcCardRow",
        level: "block",
        start(source: string) {
          return source.match(/\[\[cards[\s{]/)?.index;
        },
        tokenizer(source: string) {
          const read = readCardSource(source, CARD_ROW_SHORTCODE.token);
          if (!read) return;
          if (isAtContainerLimit()) return;

          return insideContainer(
            () =>
              ({
                type: "mcCardRow",
                raw: read.raw,
                tokens: this.lexer.blockTokens(read.body) as Token[],
                columns: Number(read.params.columns),
                spacing: resolveContainerSpacing(read.params.spacing),
              }) satisfies McCardRowToken,
          );
        },
        renderer(token) {
          const row = token as McCardRowToken;
          // The column count reaches CSS as a class rather than as a value,
          // because the stylesheet also decides when to abandon the columns
          // altogether, and that depends on the reader's screen rather than on
          // what the page asked for.
          const columnClass = `${CARD_ROW_CLASS}--${row.columns}`;
          const style = row.spacing ? ` style="gap:${row.spacing}"` : "";
          return `<div class="${CARD_ROW_CLASS} ${columnClass}"${style}>${this.parser.parse(row.tokens)}</div>\n`;
        },
      },
    ],
  };
}
