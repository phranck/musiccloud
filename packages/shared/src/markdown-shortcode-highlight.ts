/**
 * @file Works out what colour each part of a Markdown source should be.
 *
 * The spans come from {@link tokenizeShortcodes}, which is the one thing that
 * decides what a shortcode is. A highlighter with a pattern of its own would
 * drift from the scanner the first time either changed, and the editor would
 * then colour something the page does not render.
 *
 * What this adds on top of the scan is the one thing the scanner has no opinion
 * about: whether a token is a shortcode this project knows. That is a question
 * of meaning rather than of shape, and it is why an unknown token comes back
 * marked as such instead of being coloured like a real one.
 */

import { type ShortcodeNode, type ShortcodeSpanKind, tokenizeShortcodes } from "./markdown-shortcode-tokenizer.js";
import { SHORTCODE_DEFINITIONS, type ShortcodeDefinition, ShortcodeSyntax } from "./markdown-shortcodes/index.js";

/**
 * What a stretch of source is, for the purpose of colouring it.
 *
 * @remarks
 * The scanner's kinds, plus the two this module decides: a name in braces that
 * something replaces at render time, and a token no definition knows.
 */
export type ShortcodeHighlightKind = ShortcodeSpanKind | "variable" | "unknown-token";

/** One stretch of source and what it is. */
export interface ShortcodeHighlightSpan {
  kind: ShortcodeHighlightKind;
  from: number;
  to: number;
}

/**
 * A name in single braces, which is what a site variable is written as.
 *
 * Single, so it cannot match the `{{…}}` form, which the scanner has already
 * claimed as a node of its own by the time this runs.
 */
const BRACED_NAME = /(?<!\{)\{([a-zA-Z][a-zA-Z0-9]*)\}(?!\})/g;

/**
 * Marks every braced name in a stretch of text.
 *
 * @param content - The whole source.
 * @param from - Where to start looking.
 * @param to - Where to stop.
 * @param known - Which names count. A name not in the set is left unmarked, so
 *   an unrelated `{word}` in prose keeps the colour of the text around it.
 * @param out - Collected spans, appended to.
 */
function markBracedNames(
  content: string,
  from: number,
  to: number,
  known: ReadonlySet<string>,
  out: ShortcodeHighlightSpan[],
): void {
  if (known.size === 0) return;

  for (const match of content.slice(from, to).matchAll(BRACED_NAME)) {
    if (match.index === undefined) continue;
    if (!known.has(match[1])) continue;
    out.push({
      kind: "variable",
      from: from + match.index,
      to: from + match.index + match[0].length,
    });
  }
}

/**
 * Splits a quoted value around the names inside it.
 *
 * @param content - The whole source.
 * @param from - Start of the value, at its opening quote.
 * @param to - End of the value, past its closing quote.
 * @param known - Which names count.
 * @param out - Collected spans, appended to.
 *
 * @remarks
 * Split rather than laid over, so no two spans overlap and the colour of a
 * character is decided in one place. A variable works inside an attribute
 * because it is expanded before the page is parsed, so the editor shows it as
 * one there too.
 */
function markValueString(
  content: string,
  from: number,
  to: number,
  known: ReadonlySet<string>,
  out: ShortcodeHighlightSpan[],
): void {
  const names: ShortcodeHighlightSpan[] = [];
  markBracedNames(content, from, to, known, names);

  let cursor = from;
  for (const name of names) {
    if (name.from > cursor) out.push({ kind: "value-string", from: cursor, to: name.from });
    out.push(name);
    cursor = name.to;
  }
  if (cursor < to) out.push({ kind: "value-string", from: cursor, to });
}

/**
 * Collects the spans of one node and everything inside it.
 *
 * @param content - The whole source, so offsets stay absolute.
 * @param node - The node to mark.
 * @param allowed - Definitions this node's token is resolved against, which for
 *   a child is its parent's child list rather than the document's. A name can
 *   therefore mean something in one position and nothing at the top level.
 * @param known - Which braced names count.
 * @param out - Collected spans, appended to.
 */
function markNode(
  content: string,
  offset: number,
  node: ShortcodeNode,
  allowed: readonly ShortcodeDefinition[],
  known: ReadonlySet<string>,
  out: ShortcodeHighlightSpan[],
): void {
  const definition =
    node.syntax === ShortcodeSyntax.Braces
      ? allowed.find((candidate) => candidate.syntax === ShortcodeSyntax.Braces)
      : allowed.find((candidate) => candidate.token === node.token && candidate.syntax === node.syntax);

  for (const span of node.spans) {
    const from = offset + span.from;
    const to = offset + span.to;

    if (span.kind === "token" && !definition) {
      out.push({ kind: "unknown-token", from, to });
      continue;
    }

    if (span.kind === "value-string") {
      markValueString(content, from, to, known, out);
      continue;
    }

    out.push({ kind: span.kind, from, to });
  }

  for (const child of node.children) {
    markNode(content, offset, child, definition?.children ?? [], known, out);
  }

  // A body is Markdown, so what stands in it is read the way the page reads it:
  // a shortcode there is a shortcode of its own rather than a child of this one.
  if (node.bodySource) {
    collect(content, offset + node.bodySource.from, offset + node.bodySource.to, allowed, known, out);
  }
}

/**
 * Walks a stretch of source, marking its nodes and the text between them.
 *
 * @param content - The whole source.
 * @param from - Where this stretch begins.
 * @param to - Where it ends.
 * @param definitions - What a token here is resolved against.
 * @param known - Which braced names count.
 * @param out - Collected spans, appended to.
 */
function collect(
  content: string,
  from: number,
  to: number,
  definitions: readonly ShortcodeDefinition[],
  known: ReadonlySet<string>,
  out: ShortcodeHighlightSpan[],
): void {
  // The scanner is given only this stretch, because it skips over a body and
  // would otherwise hand back the container again rather than what is inside
  // it. Its offsets are then relative to the slice, so `from` is carried
  // through and added back on.
  const nodes = tokenizeShortcodes(content.slice(from, to));
  let cursor = from;

  for (const node of nodes) {
    const start = from + node.source.start;
    if (start > cursor) markBracedNames(content, cursor, start, known, out);
    markNode(content, from, node, definitions, known, out);
    cursor = from + node.source.end;
  }

  if (cursor < to) markBracedNames(content, cursor, to, known, out);
}

/**
 * Works out how every part of a Markdown source should be coloured.
 *
 * @param content - The Markdown source.
 * @param options - Which definitions apply, and which braced names are
 *   expanded before the page is parsed. The names default to none, which is
 *   what holds until site variables exist.
 * @returns Every span, ordered by where it starts and never overlapping, which
 *   is what an editor's decoration set requires.
 *
 * @remarks
 * Text that is neither a shortcode nor an expanded name produces no span at
 * all. It keeps whatever colour the Markdown highlighting gives it, which is
 * the point: this adds to that highlighting rather than replacing it.
 */
export function highlightShortcodes(
  content: string,
  options: {
    definitions?: readonly ShortcodeDefinition[];
    variableNames?: readonly string[];
  } = {},
): ShortcodeHighlightSpan[] {
  const definitions = options.definitions ?? SHORTCODE_DEFINITIONS;
  const known = new Set(options.variableNames ?? []);
  const spans: ShortcodeHighlightSpan[] = [];

  collect(content, 0, content.length, definitions, known, spans);

  return spans.sort((left, right) => left.from - right.from || left.to - right.to);
}
