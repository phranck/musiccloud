/**
 * @file Turns the HTML fragment of a Last.fm artist bio into plain text.
 *
 * Last.fm controls the fragment, while every consumer of an artist profile
 * expects plain text. Active elements, foreign content and comments are
 * dropped, block elements become word breaks, and whitespace collapses to
 * single spaces.
 */

import { type DefaultTreeAdapterTypes, parseFragment } from "parse5";

/** The namespace of ordinary HTML elements. SVG and MathML content is dropped. */
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

/** Elements whose content is never readable prose, so it is dropped with them. */
const DISCARDED_ELEMENT_NAMES = new Set([
  "embed",
  "iframe",
  "noembed",
  "noscript",
  "object",
  "plaintext",
  "script",
  "style",
  "template",
  "textarea",
  "xmp",
]);

/** Elements that separate the text before them from the text after them. */
const BLOCK_ELEMENT_NAMES = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/**
 * Collects the readable text below a parsed node, in document order.
 *
 * @param node - The node to read.
 * @param chunks - Receives the text pieces, plus a space on each side of a
 *   block element. Mutated in place.
 */
function collectReadableText(node: DefaultTreeAdapterTypes.Node, chunks: string[]): void {
  if (node.nodeName === "#text" && "value" in node) {
    chunks.push(node.value);
    return;
  }

  if ("tagName" in node) {
    const elementName = node.tagName.toLowerCase();
    if (node.namespaceURI !== HTML_NAMESPACE || DISCARDED_ELEMENT_NAMES.has(elementName)) return;

    const separatesText = BLOCK_ELEMENT_NAMES.has(elementName);
    if (separatesText) chunks.push(" ");
    for (const child of node.childNodes) collectReadableText(child, chunks);
    if (separatesText) chunks.push(" ");
    return;
  }

  if ("childNodes" in node) {
    for (const child of node.childNodes) collectReadableText(child, chunks);
  }
}

/**
 * Collapses every run of whitespace to one space and trims both ends.
 *
 * @param value - The text to collapse.
 * @returns The text with single spaces between words and none at the ends.
 */
function collapseWhitespace(value: string): string {
  let result = "";
  let separatorPending = false;

  for (const character of value) {
    if (character.trim().length === 0) {
      separatorPending = result.length > 0;
      continue;
    }
    if (separatorPending) result += " ";
    result += character;
    separatorPending = false;
  }

  return result;
}

/**
 * Parses an HTML fragment once and returns its readable text.
 *
 * @param value - The fragment.
 * @returns The readable text with collapsed whitespace, empty when there is none.
 */
function parsePlainTextFragment(value: string): string {
  const chunks: string[] = [];
  collectReadableText(parseFragment(value), chunks);
  return collapseWhitespace(chunks.join(""));
}

/**
 * Turns a Last.fm bio summary into plain text.
 *
 * Parsing once removes active nodes and attributes. Parsing the extracted
 * text again keeps entity-encoded markup from becoming executable if a later
 * rendering boundary interprets the value.
 *
 * @param raw - The summary as Last.fm sends it, or `null` when it sent none.
 * @returns The plain text, or `null` when there is no summary or it holds no readable prose.
 */
export function extractBioSummary(raw: string | null): string | null {
  if (!raw) return null;
  const decodedText = parsePlainTextFragment(raw);
  if (!decodedText) return null;
  return parsePlainTextFragment(decodedText) || null;
}
