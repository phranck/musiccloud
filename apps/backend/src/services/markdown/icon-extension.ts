/**
 * @file Renders the symbol shortcode.
 *
 * A symbol answers two questions that are kept apart on purpose: where the
 * symbol itself stands in the block, and where its text sits against it. The
 * second is only ever about the text, so centring a symbol that carries no text
 * never means reaching for the text's alignment to do it.
 *
 * Without a text, an alignment naming a side floats the symbol instead, so the
 * paragraph that follows runs past it.
 */

import {
  ICON_DEFAULT_SIZE,
  ICON_SHORTCODE,
  IconAlignment,
  type IconAlignmentValue,
  IconTextAlignment,
  type IconTextAlignmentValue,
  parseShortcodes,
  readShortcodeAt,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import { resolveContainerSpacing } from "./containers.js";
import { duotonePaths } from "./phosphor-duotone.js";

/** A hex figure of three, four, six or eight digits, with or without its hash. */
const HEX_COLOUR = /^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A colour named in words, which is how CSS spells `tomato` and `rebeccapurple`. */
const NAMED_COLOUR = /^[a-z]+$/i;

/** A reference to one of the design system's own colours. */
const TOKEN_COLOUR = /^var\(--[a-z0-9-]+\)$/i;

/**
 * The classes that place a text against its symbol.
 *
 * The first class names the axis and which end of it the symbol takes, the
 * second where the text sits across that axis. `center` names no side at all
 * and lays the text over the middle of the symbol, which is what SwiftUI's
 * `.center` does in a `ZStack`.
 */
const TEXT_ALIGNMENT_CLASSES: Record<IconTextAlignmentValue, string> = {
  [IconTextAlignment.Trailing]: "mc-icon-pair--row",
  [IconTextAlignment.Leading]: "mc-icon-pair--row-reverse",
  [IconTextAlignment.TopTrailing]: "mc-icon-pair--row mc-icon-pair--start",
  [IconTextAlignment.TopLeading]: "mc-icon-pair--row-reverse mc-icon-pair--start",
  [IconTextAlignment.BottomTrailing]: "mc-icon-pair--row mc-icon-pair--end",
  [IconTextAlignment.BottomLeading]: "mc-icon-pair--row-reverse mc-icon-pair--end",
  [IconTextAlignment.Bottom]: "mc-icon-pair--column",
  [IconTextAlignment.Top]: "mc-icon-pair--column-reverse",
  [IconTextAlignment.Center]: "mc-icon-pair--stacked",
};

/**
 * The classes that float a symbol so the paragraph beside it runs around it.
 *
 * An alignment names where the text goes, so the symbol takes the opposite
 * side: `trailing` puts the text on the right and therefore floats the symbol
 * to the left. Only the horizontal alignments name a side at all, and the
 * others are absent here, because a paragraph cannot flow above or below
 * something.
 */
const FLOAT_CLASSES: Partial<Record<IconTextAlignmentValue, string>> = {
  [IconTextAlignment.Trailing]: "mc-icon--float-start",
  [IconTextAlignment.TopTrailing]: "mc-icon--float-start",
  [IconTextAlignment.BottomTrailing]: "mc-icon--float-start",
  [IconTextAlignment.Leading]: "mc-icon--float-end",
  [IconTextAlignment.TopLeading]: "mc-icon--float-end",
  [IconTextAlignment.BottomLeading]: "mc-icon--float-end",
};

/** The classes that place the symbol itself in the block it sits in. */
const ALIGNMENT_CLASSES: Record<IconAlignmentValue, string> = {
  [IconAlignment.Leading]: "mc-icon--align-start",
  [IconAlignment.Center]: "mc-icon--align-center",
  [IconAlignment.Trailing]: "mc-icon--align-end",
};

/** The closing tag of a paragraph, used to recognise a text that is only one. */
const PARAGRAPH_END = "</p>";

interface McIconToken extends Tokens.Generic {
  type: "mcIcon";
  markup: string;
  /** The text beside the symbol, already lexed, or `null` where there is none. */
  textTokens: Token[] | null;
  /** The classes the pair around the two carries, or `null` for a bare symbol. */
  pairClass: string | null;
  /** The gap between the two as CSS, or `null` to let the stylesheet decide. */
  spacing: string | null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

/**
 * The colour a symbol is drawn in, from what the page wrote.
 *
 * A bare hex figure gets its hash, so `cea836` and `#cea836` mean the same
 * thing. Anything that is none of the three forms becomes the colour of the
 * surrounding text, because a value reaching `fill` unread can point at a paint
 * server elsewhere in the document instead of naming a colour.
 *
 * @param raw - The `color` parameter, where the page wrote one.
 * @returns A value that is safe to put in `fill`.
 */
function resolveFill(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return "currentColor";
  if (HEX_COLOUR.test(value)) return value.startsWith("#") ? value : `#${value}`;
  if (NAMED_COLOUR.test(value) || TOKEN_COLOUR.test(value)) return value;
  return "currentColor";
}

/**
 * Draws one symbol.
 *
 * Exported because the button draws one too, and a second drawing of the same
 * thing would be a second answer to what a symbol is.
 *
 * @param name - The icon in the spelling Phosphor publishes.
 * @param size - Its edge length in pixels.
 * @param fill - What it is drawn in, already checked.
 * @param className - What the element carries, which places it where it has no
 *   text of its own.
 * @returns The markup, or `null` when the name leads to no icon.
 */
export function renderSymbol(name: string, size: number, fill: string, className: string): string | null {
  const paths = duotonePaths(name);
  if (!paths) return null;

  const shapes = paths
    .map((shape) => {
      const opacity = shape.opacity ? ` opacity="${escapeHtmlAttribute(shape.opacity)}"` : "";
      return `<path d="${escapeHtmlAttribute(shape.d)}"${opacity}></path>`;
    })
    .join("");

  return `<svg class="${className}" viewBox="0 0 256 256" width="${size}" height="${size}" fill="${escapeHtmlAttribute(fill)}" role="img" aria-hidden="true">${shapes}</svg>`;
}

/**
 * The symbol shortcode as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createIconExtension(): MarkedExtension {
  return {
    extensions: [
      {
        name: "mcIcon",
        level: "inline",
        start(source: string) {
          return source.match(/\[\[icon[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== ICON_SHORTCODE.token) return;

          const [parsed] = parseShortcodes(node.source.raw, [ICON_SHORTCODE]);
          const name = typeof parsed?.params.name === "string" ? parsed.params.name : "";
          if (!name) return;

          const size = typeof parsed?.params.size === "number" ? parsed.params.size : ICON_DEFAULT_SIZE;
          const fill = resolveFill(typeof parsed?.params.color === "string" ? parsed.params.color : undefined);
          const text = typeof parsed?.params.text === "string" ? parsed.params.text.trim() : "";

          // A text with no alignment sits after the symbol, the way a label
          // follows the symbol on a button.
          const written = parsed?.params.textalignment;
          const textAlignment = (
            typeof written === "string" ? written : text ? IconTextAlignment.Trailing : null
          ) as IconTextAlignmentValue | null;
          const alignment = (
            typeof parsed?.params.alignment === "string" ? parsed.params.alignment : null
          ) as IconAlignmentValue | null;

          // Without a text, an alignment naming a side floats the symbol so the
          // next paragraph runs past it. A floated element is placed by the
          // float itself, so the alignment has nothing left to say in that case.
          const floated = text || !textAlignment ? undefined : FLOAT_CLASSES[textAlignment];
          const placed = floated ?? (alignment ? ALIGNMENT_CLASSES[alignment] : undefined);
          const paired = Boolean(text && textAlignment);

          const markup = renderSymbol(
            name,
            size,
            fill,
            ["mc-icon", paired ? undefined : placed].filter(Boolean).join(" "),
          );
          // A name nobody can find leaves the shortcode standing in the text, so
          // whoever wrote it sees that the name is wrong rather than a gap.
          if (!markup) return;

          return {
            type: "mcIcon",
            raw: node.source.raw,
            markup,
            // Lexed as blocks, because a text may carry a heading and a
            // heading written into a line of inline tokens is text.
            textTokens: paired ? (this.lexer.blockTokens(text) as Token[]) : null,
            pairClass:
              paired && textAlignment
                ? ["mc-icon-pair", TEXT_ALIGNMENT_CLASSES[textAlignment], placed].filter(Boolean).join(" ")
                : null,
            spacing: resolveContainerSpacing(parsed?.params.spacing),
          } satisfies McIconToken;
        },
        renderer(token) {
          const icon = token as McIconToken;
          if (!icon.textTokens || !icon.pairClass) return icon.markup;

          const rendered = this.parser.parse(icon.textTokens).trim();
          // A text of a few words belongs inside the line the symbol sits on,
          // so its paragraph goes and the pair stays inline. One carrying a
          // heading or several paragraphs cannot go there: a heading is not
          // permitted inside a `span`, and a browser meeting one breaks the
          // surrounding paragraph open to fix it. Such a text gets a `div`
          // instead, which is what a browser would have made of it anyway.
          const single =
            rendered.startsWith("<p>") && rendered.indexOf(PARAGRAPH_END) === rendered.length - PARAGRAPH_END.length;
          const text = single ? rendered.slice("<p>".length, -PARAGRAPH_END.length) : rendered;
          const tag = single ? "span" : "div";

          const style = icon.spacing ? ` style="gap:${icon.spacing}"` : "";
          return `<${tag} class="${icon.pairClass}"${style}>${icon.markup}<${tag} class="mc-icon-pair__label">${text}</${tag}></${tag}>`;
        },
      },
    ],
  };
}
