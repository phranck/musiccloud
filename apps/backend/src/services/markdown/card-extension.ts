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
  CARD_BODY_SHORTCODE,
  CARD_FOOTER_SHORTCODE,
  CARD_HEADER_SHORTCODE,
  CARD_ROW_SHORTCODE,
  CARD_SHORTCODE,
  ICON_DEFAULT_SIZE,
  parseShortcodes,
  readShortcodeAt,
  type ShortcodeNode,
  type ShortcodeParamValue,
  type SingleContentContext,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import { insideContainer, isAtContainerLimit, resolveContainerSpacing } from "./containers.js";
import { iconSetFor, renderSymbol } from "./icon-extension.js";

/** The class the stylesheet gives one card. */
const CARD_CLASS = "mc-card";

/** The class the stylesheet gives what stands above a card's content. */
const CARD_HEADER_CLASS = "mc-card__header";

/** The class the stylesheet gives what stands below it. */
const CARD_FOOTER_CLASS = "mc-card__footer";

/**
 * The class a sectioned card's own content carries.
 *
 * A card with a header or a footer draws each as a band that reaches the card's
 * edges, so the card itself carries no padding and the content needs an element
 * of its own to carry it. A card written in the short form has no bands and
 * keeps its own padding, so its content needs nothing.
 */
const CARD_BODY_CLASS = "mc-card__body";

/** The class the stylesheet gives a row of them. */
const CARD_ROW_CLASS = "mc-cards";

/** The class a header's own symbol carries. */
const CARD_HEADER_ICON_CLASS = "mc-card__header-icon";

/** The three parts a card may be written in, by the token each is named with. */
const SECTION_TOKENS = new Set<string>([
  CARD_HEADER_SHORTCODE.token,
  CARD_BODY_SHORTCODE.token,
  CARD_FOOTER_SHORTCODE.token,
]);

/** A card or a row as the tokenizer read it, in whichever of the two forms. */
interface CardSource {
  raw: string;
  /** What stood between the braces, or `undefined` where the card named parts. */
  body: string | undefined;
  /** The parts it named, empty where it carried content instead. */
  children: readonly ShortcodeNode[];
  params: Record<string, ShortcodeParamValue>;
}

/**
 * What a card is made of, once its body has been read.
 *
 * @property header - The header's text as source, or `null` where there is none.
 * @property headerIcon - The symbol beside it, already drawn.
 * @property body - The card's own content as source.
 * @property footer - What it closes with, as source.
 */
interface CardSections {
  /** Whether the card names its parts, which decides how it is drawn. */
  sectioned: boolean;
  header: string | null;
  headerIcon: string | null;
  body: string;
  footer: string | null;
}

interface McCardToken extends Tokens.Generic {
  type: "mcCard";
  tokens: Token[];
  /** Whether the card is written in its three parts rather than as one body. */
  sectioned: boolean;
  /** What stands above the content, already lexed, or `null` where nothing does. */
  headerTokens: Token[] | null;
  /** The symbol beside the header, already drawn. */
  headerIcon: string | null;
  /** What stands below it. */
  footerTokens: Token[] | null;
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
 * A card is written one of two ways, and this hands back both: with braces it
 * carries page content, and without them it carries its parts. A row of cards
 * only ever carries cards, so it is always the second.
 *
 * @param source - What marked is offering, from the current position.
 * @param token - Which of the two layout shortcodes to look for.
 * @returns The raw source, whichever of the two it carries, and the resolved
 *   parameters, or `null` when the source does not begin with that shortcode.
 */
function readCardSource(source: string, token: string): CardSource | null {
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== token) return null;
  if (node.body === undefined && node.children.length === 0) return null;

  // Through the parser, so the bounds and the defaults the registry declares
  // are the ones that hold here. Reading `node.attributes` directly would be a
  // second answer to what `columns` accepts.
  const definition = token === CARD_SHORTCODE.token ? CARD_SHORTCODE : CARD_ROW_SHORTCODE;
  const [parsed] = parseShortcodes(node.source.raw, [definition]);

  return { raw: node.source.raw, body: node.body, children: node.children, params: parsed?.params ?? {} };
}

/**
 * Reads a card's body into the three parts it may be written in.
 *
 * A card written with braces is all body, which is the short form and the one
 * most cards are written in. A card written without them names its parts, and
 * the order they stand in decides nothing: the card knows where each goes.
 *
 * @param read - The card as the tokenizer read it.
 * @param context - Which surface this renders for, which decides the icon set.
 * @returns The parts, with the body empty where a sectioned card names none.
 */
function readCardSections(read: CardSource, context: SingleContentContext): CardSections {
  // A card written with braces holds page content and nothing else, which is
  // the short form. A card written without them holds its parts and nothing
  // else, which the tokenizer has already read as children.
  if (read.body !== undefined) {
    return { sectioned: false, header: null, headerIcon: null, body: read.body, footer: null };
  }

  const nodes = read.children.filter((node) => SECTION_TOKENS.has(node.token));

  const sections: CardSections = { sectioned: true, header: null, headerIcon: null, body: "", footer: null };

  for (const node of nodes) {
    if (node.token === CARD_BODY_SHORTCODE.token) {
      sections.body = node.body ?? "";
      continue;
    }
    if (node.token === CARD_FOOTER_SHORTCODE.token) {
      sections.footer = node.body ?? "";
      continue;
    }

    const [parsed] = parseShortcodes(node.source.raw, [CARD_HEADER_SHORTCODE]);
    const text = typeof parsed?.params.text === "string" ? parsed.params.text.trim() : "";
    if (!text) continue;

    sections.header = text;
    const icon = typeof parsed?.params.icon === "string" ? parsed.params.icon.trim() : "";
    sections.headerIcon = icon
      ? renderSymbol(iconSetFor(context), icon, ICON_DEFAULT_SIZE, "currentColor", CARD_HEADER_ICON_CLASS)
      : null;
  }

  return sections;
}

/**
 * Lexes a header or a footer, where the page wrote one.
 *
 * @param lexer - The lexer reading the document this card sits in.
 * @param value - What the parameter held.
 * @returns The tokens, or `null` where the page wrote nothing.
 */
function lexPart(lexer: { blockTokens(source: string): unknown }, value: string | null): Token[] | null {
  if (value === null || value.trim() === "") return null;
  return lexer.blockTokens(value.trim()) as Token[];
}

/**
 * The card shortcode as a marked extension.
 *
 * @param context - Which surface it renders for, which a header's symbol needs.
 * @returns The extension, ready to register.
 */
export function createCardExtension(context: SingleContentContext): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcCard",
        level: "block",
        start(source: string) {
          return source.match(/\[\[card[\s{\]]/)?.index;
        },
        tokenizer(source: string) {
          const read = readCardSource(source, CARD_SHORTCODE.token);
          if (!read) return;

          // A card past the limit is left as text, so the source appears on the
          // page and whoever wrote it can see what happened. Rendering it as a
          // plain card instead would hide a document that nests without end.
          if (isAtContainerLimit()) return;

          return insideContainer(() => {
            const sections = readCardSections(read, context);
            return {
              type: "mcCard",
              raw: read.raw,
              sectioned: sections.sectioned,
              tokens: this.lexer.blockTokens(sections.body) as Token[],
              // Lexed as blocks, because a header is usually a heading and a
              // heading written into a line of inline tokens is text.
              headerTokens: lexPart(this.lexer, sections.header),
              headerIcon: sections.headerIcon,
              footerTokens: lexPart(this.lexer, sections.footer),
            } satisfies McCardToken;
          });
        },
        renderer(token) {
          const card = token as McCardToken;
          const header = card.headerTokens
            ? `<div class="${CARD_HEADER_CLASS}">${card.headerIcon ?? ""}${this.parser.parse(card.headerTokens)}</div>`
            : "";
          const footer = card.footerTokens
            ? `<div class="${CARD_FOOTER_CLASS}">${this.parser.parse(card.footerTokens)}</div>`
            : "";
          const content = this.parser.parse(card.tokens);
          const body = card.sectioned ? `<div class="${CARD_BODY_CLASS}">${content}</div>` : content;
          const sectionedClass = card.sectioned ? ` ${CARD_CLASS}--sectioned` : "";
          return `<div class="${CARD_CLASS}${sectionedClass}">${header}${body}${footer}</div>\n`;
        },
      },
      {
        name: "mcCardRow",
        level: "block",
        start(source: string) {
          return source.match(/\[\[cards[\s{\]]/)?.index;
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
                tokens: this.lexer.blockTokens(read.body ?? "") as Token[],
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
