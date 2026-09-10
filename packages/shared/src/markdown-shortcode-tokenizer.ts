/**
 * @file Turns shortcode source into a flat list of nodes.
 *
 * This module knows the three shapes a shortcode is written in and nothing
 * else: it consults no definition, validates no attribute, and reports only
 * what it cannot read at all. Meaning is applied afterwards by the parser,
 * which keeps the scanning small enough to reason about.
 *
 * Every node records where each of its parts stands, as a {@link ShortcodeSpan}.
 * Reading that back out of the source afterwards would be a second grammar, and
 * the two would disagree about where a value ends the first time either one
 * changed. The editor colours from these spans and the page renders from these
 * nodes, so what a writer sees highlighted is what will actually render.
 *
 * Two properties of the bracket scan decide what an author may write. It tracks
 * quotes, so an attribute value in single or double quotes runs to its closing
 * quote and everything inside it is text, including newlines and brackets. And
 * it closes only on `]]` outside a quoted value, so a single `]` in prose stays
 * ordinary text.
 */

import { ShortcodeSyntax, type ShortcodeSyntaxValue } from "./markdown-shortcodes/index.js";

/** A quoted or bare attribute value, or `true` when the attribute is a flag. */
export type ShortcodeAttributeValue = string | true;

/**
 * What one stretch of a node's source is, for the purpose of colouring it.
 *
 * @remarks
 * Recorded whilst scanning rather than worked out again afterwards, because a
 * second reading would be a second grammar.
 */
export type ShortcodeSpanKind =
  /** The `[[` and `]]` that open and close a bracket node. */
  | "bracket"
  /** The `{{` and `}}` of the braces form. */
  | "brace-marker"
  /** The `:` before a target and the `=` before a value. */
  | "separator"
  /** The token directly after `[[`. */
  | "token"
  /** What follows the colon, where a shortcode takes one. */
  | "target"
  /** An attribute's name, whether or not a value follows it. */
  | "attribute-name"
  /** A value in single or double quotes, including the quotes. */
  | "value-string"
  /** A value written without quotes, which is a number or a bare word. */
  | "value-bare"
  /** The braces around a bracket node's body. What stands between them is not a span. */
  | "body-brace";

/** One stretch of source, as offsets into the whole content. */
export interface ShortcodeSpan {
  kind: ShortcodeSpanKind;
  from: number;
  to: number;
}

/** One attribute exactly as written, kept so repeats survive in order. */
export interface ShortcodeAttribute {
  name: string;
  value: ShortcodeAttributeValue;
  quoted: "single" | "double" | "bare" | "flag";
}

/** What the scanner reports when it cannot read something. */
export const ShortcodeSyntaxIssueCode = {
  UnterminatedValue: "UnterminatedValue",
  UnterminatedBody: "UnterminatedBody",
  InvalidAttribute: "InvalidAttribute",
} as const;

/** One of the codes in {@link ShortcodeSyntaxIssueCode}. */
export type ShortcodeSyntaxIssueCodeValue = (typeof ShortcodeSyntaxIssueCode)[keyof typeof ShortcodeSyntaxIssueCode];

/** Something the scanner could not read. */
export interface ShortcodeSyntaxIssue {
  code: ShortcodeSyntaxIssueCodeValue;
  message: string;
  /** Offset into the original content, so an editor can point at it. */
  offset: number;
}

/** One node of the scan. */
export interface ShortcodeNode {
  /** Which notation it was written in. */
  syntax: ShortcodeSyntaxValue;
  /**
   * What followed `[[`.
   *
   * Empty for the braces form, which carries no token: what stands between the
   * braces is its target, and which shortcode that is belongs to the registry
   * rather than to the scan.
   */
  token: string;
  target?: string;
  attributes: Record<string, ShortcodeAttributeValue>;
  rawAttributes: ShortcodeAttribute[];
  children: ShortcodeNode[];
  /**
   * The content a container carries, with escaped braces already resolved and
   * the indentation of its nesting removed.
   *
   * Absent where the node was written without one. The text is unscanned, so a
   * shortcode inside it is still source rather than a node.
   */
  body?: string;
  /**
   * Where the body stands in the original content, between its delimiters.
   *
   * @remarks
   * Given alongside {@link ShortcodeNode.body} because that text is dedented
   * and its offsets no longer match. Anything wanting to scan the body in
   * place, such as an editor colouring the shortcodes inside a container, reads
   * it from here.
   */
  bodySource?: { from: number; to: number };
  issues: ShortcodeSyntaxIssue[];
  source: { start: number; end: number; raw: string };
  /**
   * Where each part of this node stands, in the order it was read.
   *
   * @remarks
   * This node's own parts only. A child's spans hang off the child, and the
   * text inside a body is deliberately absent: it is Markdown, and whoever
   * displays it reads it as such.
   */
  spans: ShortcodeSpan[];
}

/**
 * Longest span a bracket node may cover, in characters, including its children.
 *
 * A node may run over several lines, so an unclosed `[[` would otherwise search
 * the rest of the document for a `]]` and swallow whatever lies between. The
 * cap bounds that to a couple of paragraphs, and it is set well above what a
 * real shortcode needs because exceeding it fails quietly: the node stops
 * matching and its source appears on the page.
 */
export const MAX_NODE_LENGTH = 8000;

/**
 * Longest body a node may carry, in characters.
 *
 * Separate from {@link MAX_NODE_LENGTH}, which bounds a run of attributes and
 * is sized for one. A container holds page content, so a paragraph or two is
 * the small case rather than the large one, and this cap exists only to stop an
 * unclosed brace from swallowing the rest of the document.
 */
export const MAX_BODY_LENGTH = 20000;

const TOKEN_PATTERN = /^[a-z][a-z0-9-]*/;
const ATTRIBUTE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*/;

const BRACKET_OPEN = "[[";
const BRACKET_CLOSE = "]]";
const BRACES_OPEN = "{{";
const BRACES_CLOSE = "}}";
const BODY_OPEN = "{";
const BODY_CLOSE = "}";

/** True when `content` carries `marker` at `index`. */
function isAt(content: string, index: number, marker: string): boolean {
  return content.startsWith(marker, index);
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

/**
 * Reads one attribute starting at `cursor`.
 *
 * @param content - The whole source.
 * @param cursor - Where the attribute's name is expected.
 * @param limit - How far the value may run. A bracket node's attributes may
 *   cross lines, so its limit is the end of the source, and an unclosed quote
 *   there simply leaves the node unfinished. A fence's attributes stand on its
 *   opening line, so its limit is the end of that line, which is what stops an
 *   unclosed quote from swallowing the rest of the document.
 * @param issues - Collected problems, appended to.
 * @param spans - Collected spans, appended to.
 * @returns The attribute and the offset just past it, or `null` when the text
 *   at `cursor` cannot begin an attribute.
 */
function readAttribute(
  content: string,
  cursor: number,
  limit: number,
  issues: ShortcodeSyntaxIssue[],
  spans: ShortcodeSpan[],
): { attribute: ShortcodeAttribute; next: number } | null {
  const nameMatch = content.slice(cursor).match(ATTRIBUTE_NAME_PATTERN);
  if (!nameMatch) return null;

  const name = nameMatch[0];
  let index = cursor + name.length;
  spans.push({ kind: "attribute-name", from: cursor, to: index });

  // A bare name is a flag, as in `recommended`.
  if (content[index] !== "=") {
    return { attribute: { name, value: true, quoted: "flag" }, next: index };
  }

  spans.push({ kind: "separator", from: index, to: index + 1 });
  index += 1;
  const quote = content[index];

  if (quote === '"' || quote === "'") {
    const quoteStart = index;
    index += 1;
    const valueStart = index;
    while (index < limit && content[index] !== quote) index += 1;

    if (index >= limit) {
      issues.push({
        code: ShortcodeSyntaxIssueCode.UnterminatedValue,
        message: `Attribute "${name}" has an unterminated quoted value.`,
        offset: cursor,
      });
      // Spanned to the limit anyway, so an editor colours what the author is
      // still typing rather than leaving it in the surrounding text's colour.
      spans.push({ kind: "value-string", from: quoteStart, to: limit });
      return {
        attribute: {
          name,
          value: content.slice(valueStart, limit),
          quoted: quote === '"' ? "double" : "single",
        },
        next: limit,
      };
    }

    // The quotes belong to the value: they mark where it starts and ends, and
    // colouring them apart from what they enclose says nothing extra.
    spans.push({ kind: "value-string", from: quoteStart, to: index + 1 });
    return {
      attribute: {
        name,
        value: content.slice(valueStart, index),
        quoted: quote === '"' ? "double" : "single",
      },
      next: index + 1,
    };
  }

  // A bare value runs to the next whitespace, and stops at a closing pair so
  // `[[pill:Beta tone=info]]` does not read the brackets as part of the value.
  const valueStart = index;
  while (index < limit && !isWhitespace(content[index]) && !isAt(content, index, BRACKET_CLOSE)) {
    index += 1;
  }

  spans.push({ kind: "value-bare", from: valueStart, to: index });
  return {
    attribute: { name, value: content.slice(valueStart, index), quoted: "bare" },
    next: index,
  };
}

/**
 * Removes the indentation a body carries only because of where it is written.
 *
 * A nested container indents its content, and at two levels that is four
 * spaces, which Markdown reads as a code block. The structure of the document
 * would then decide how its content is understood, and a heading inside two
 * containers would come out as source text.
 *
 * The smallest indentation any line carries is what belongs to the nesting, so
 * that much comes off every line. Whatever a line indents beyond it is its own,
 * and a genuine code block written deeper than its neighbours survives.
 *
 * The blank lines against the braces go too. `{` on one line and `}` on another
 * is how anybody writes a container, so those two breaks belong to the notation
 * rather than to the content, and leaving them in would put an empty paragraph
 * at the top and bottom of every container on the page.
 *
 * @param body - The body as it stands in the source.
 * @returns The same body without the indentation of its nesting.
 */
function dedentBody(body: string): string {
  const lines = body.split("\n");
  if (lines.length === 1) return body.trim();

  let common = Number.POSITIVE_INFINITY;
  // From the second line: a body starting on the same line as its brace has no
  // indentation there to measure.
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    common = Math.min(common, line.length - line.trimStart().length);
  }

  const dedented =
    !Number.isFinite(common) || common === 0
      ? [lines[0].trimStart(), ...lines.slice(1)]
      : [lines[0].trimStart(), ...lines.slice(1).map((line) => (line.trim() === "" ? "" : line.slice(common)))];

  while (dedented.length > 0 && dedented[0].trim() === "") dedented.shift();
  while (dedented.length > 0 && dedented[dedented.length - 1].trim() === "") dedented.pop();

  return dedented.join("\n");
}

/**
 * Reads a braced body whose opening `{` sits at `start`.
 *
 * Braces are counted, so a container holding another container closes on its
 * own brace rather than on the inner one. Nothing else is interpreted: quotes
 * are ordinary characters here, because a body is prose and an apostrophe in it
 * is an apostrophe.
 *
 * A brace that is part of the text is written `\{` or `\}`. The backslash is
 * removed as the body is read, so what comes back is what the author meant.
 *
 * @param content - The whole source.
 * @param start - Offset of the opening brace.
 * @param issues - Collected problems, appended to.
 * @returns The body and the offset just past its closing `}`, or `null` when
 *   the body never closes or outgrows {@link MAX_BODY_LENGTH}.
 */
function readBody(
  content: string,
  start: number,
  issues: ShortcodeSyntaxIssue[],
): { body: string; next: number } | null {
  const bodyStart = start + BODY_OPEN.length;
  let cursor = bodyStart;
  let depth = 1;
  const parts: string[] = [];
  let plainFrom = bodyStart;

  while (cursor < content.length) {
    if (cursor - bodyStart > MAX_BODY_LENGTH) return null;

    const character = content[cursor];

    if (character === "\\") {
      const escaped = content[cursor + 1];
      if (escaped === BODY_OPEN || escaped === BODY_CLOSE) {
        parts.push(content.slice(plainFrom, cursor), escaped);
        cursor += 2;
        plainFrom = cursor;
        continue;
      }
    }

    if (character === BODY_OPEN) {
      depth += 1;
    } else if (character === BODY_CLOSE) {
      depth -= 1;
      if (depth === 0) {
        parts.push(content.slice(plainFrom, cursor));
        return { body: dedentBody(parts.join("")), next: cursor + BODY_CLOSE.length };
      }
    }

    cursor += 1;
  }

  issues.push({
    code: ShortcodeSyntaxIssueCode.UnterminatedBody,
    message: "A body opened with { was never closed.",
    offset: start,
  });
  return null;
}

/**
 * Reads one bracket node whose opening `[[` sits at `start`.
 *
 * @param content - The whole source.
 * @param start - Offset of the opening `[[`.
 * @returns The node and the offset just past its closing `]]`, or `null` when
 *   no node begins there or the node never closes.
 */
function readBracketNode(content: string, start: number): { node: ShortcodeNode; next: number } | null {
  const issues: ShortcodeSyntaxIssue[] = [];
  const spans: ShortcodeSpan[] = [];
  let cursor = start + BRACKET_OPEN.length;

  const tokenMatch = content.slice(cursor).match(TOKEN_PATTERN);
  if (!tokenMatch) return null;

  spans.push({ kind: "bracket", from: start, to: cursor });

  const token = tokenMatch[0];
  spans.push({ kind: "token", from: cursor, to: cursor + token.length });
  cursor += token.length;

  let target: string | undefined;
  if (content[cursor] === ":") {
    spans.push({ kind: "separator", from: cursor, to: cursor + 1 });
    cursor += 1;
    const targetStart = cursor;
    // A target runs to the first attribute rather than to the first space, so
    // a pill may be several words. An attribute is a name followed by `=`, and
    // nothing else looks like one.
    while (cursor < content.length && !isAt(content, cursor, BRACKET_CLOSE)) {
      if (isWhitespace(content[cursor]) && startsAttribute(content, cursor + 1)) break;
      cursor += 1;
    }
    target = content.slice(targetStart, cursor).trim() || undefined;
    if (target) spans.push({ kind: "target", from: targetStart, to: cursor });
  }

  const attributes: Record<string, ShortcodeAttributeValue> = {};
  const rawAttributes: ShortcodeAttribute[] = [];
  const children: ShortcodeNode[] = [];

  while (cursor < content.length) {
    if (cursor - start > MAX_NODE_LENGTH) return null;

    if (isWhitespace(content[cursor])) {
      cursor += 1;
      continue;
    }

    if (isAt(content, cursor, BRACKET_CLOSE)) {
      spans.push({ kind: "bracket", from: cursor, to: cursor + BRACKET_CLOSE.length });
      cursor += BRACKET_CLOSE.length;
      return {
        node: {
          syntax: ShortcodeSyntax.Bracket,
          token,
          target,
          attributes,
          rawAttributes,
          children,
          issues,
          source: { start, end: cursor, raw: content.slice(start, cursor) },
          spans,
        },
        next: cursor,
      };
    }

    // A body ends the node: it is the last thing written, and only the closing
    // pair may follow it. Anything after the brace would be an attribute
    // standing behind the content it describes, which reads as a mistake and is
    // treated as one.
    if (isAt(content, cursor, BODY_OPEN)) {
      const braceStart = cursor;
      const read = readBody(content, cursor, issues);
      if (!read) return null;

      const bodyEnd = read.next;
      cursor = bodyEnd;
      spans.push({ kind: "body-brace", from: braceStart, to: braceStart + BODY_OPEN.length });
      spans.push({ kind: "body-brace", from: bodyEnd - BODY_CLOSE.length, to: bodyEnd });

      while (cursor < content.length && isWhitespace(content[cursor])) cursor += 1;
      if (!isAt(content, cursor, BRACKET_CLOSE)) return null;
      spans.push({ kind: "bracket", from: cursor, to: cursor + BRACKET_CLOSE.length });
      cursor += BRACKET_CLOSE.length;

      return {
        node: {
          syntax: ShortcodeSyntax.Bracket,
          token,
          target,
          attributes,
          rawAttributes,
          children,
          body: read.body,
          bodySource: { from: braceStart + BODY_OPEN.length, to: bodyEnd - BODY_CLOSE.length },
          issues,
          source: { start, end: cursor, raw: content.slice(start, cursor) },
          spans,
        },
        next: cursor,
      };
    }

    if (isAt(content, cursor, BRACKET_OPEN)) {
      const child = readBracketNode(content, cursor);
      if (!child) {
        // Not a node after all, so step over the marker rather than looping.
        cursor += BRACKET_OPEN.length;
        continue;
      }
      children.push(child.node);
      cursor = child.next;
      continue;
    }

    const read = readAttribute(content, cursor, content.length, issues, spans);
    if (!read) {
      issues.push({
        code: ShortcodeSyntaxIssueCode.InvalidAttribute,
        message: "Attribute names must start with a letter.",
        offset: cursor,
      });
      cursor += 1;
      continue;
    }

    attributes[read.attribute.name] = read.attribute.value;
    rawAttributes.push(read.attribute);
    cursor = read.next;
  }

  return null;
}

/**
 * True when an attribute begins at `index`.
 *
 * A name followed by `=` is the only thing that does, which is what lets a
 * target run over several words without swallowing the attributes behind it.
 *
 * @param content - The whole source.
 * @param index - Where to look.
 * @returns Whether the text there is `name=`.
 */
function startsAttribute(content: string, index: number): boolean {
  const match = content.slice(index).match(ATTRIBUTE_NAME_PATTERN);
  return match !== null && content[index + match[0].length] === "=";
}

/**
 * Reads one braces node whose `{{` sits at `start`.
 *
 * @param content - The whole source.
 * @param start - Offset of the opening `{{`.
 * @returns The node and the offset just past its closing `}}`, or `null` when
 *   it never closes or carries nothing.
 */
function readBracesNode(content: string, start: number): { node: ShortcodeNode; next: number } | null {
  const contentStart = start + BRACES_OPEN.length;
  const closeIndex = content.indexOf(BRACES_CLOSE, contentStart);
  if (closeIndex === -1) return null;

  const target = content.slice(contentStart, closeIndex).trim();
  // An empty pair marks nothing, and treating it as a node would colour a
  // stray `{{}}` as though it rendered something.
  if (!target || target.includes("\n")) return null;

  const end = closeIndex + BRACES_CLOSE.length;
  return {
    node: {
      syntax: ShortcodeSyntax.Braces,
      token: "",
      target,
      attributes: {},
      rawAttributes: [],
      children: [],
      issues: [],
      source: { start, end, raw: content.slice(start, end) },
      spans: [
        { kind: "brace-marker", from: start, to: contentStart },
        { kind: "target", from: contentStart, to: closeIndex },
        { kind: "brace-marker", from: closeIndex, to: end },
      ],
    },
    next: end,
  };
}

/**
 * Reads the one node that begins at `index`, if any.
 *
 * For a caller that already knows where a node should start and only wants to
 * know whether one does, such as a Markdown renderer being offered the rest of
 * a document at each position. Scanning the whole remainder to answer that
 * would cost the length of the document at every character.
 *
 * @param content - The Markdown source.
 * @param index - Where the node is expected to begin.
 * @returns The node, or `null` when none begins exactly there.
 */
export function readShortcodeAt(content: string, index: number): ShortcodeNode | null {
  if (isAt(content, index, BRACKET_OPEN)) return readBracketNode(content, index)?.node ?? null;
  if (isAt(content, index, BRACES_OPEN)) return readBracesNode(content, index)?.node ?? null;
  return null;
}

/**
 * Scans `content` and returns every top-level node, in the order they appear.
 *
 * Nodes nested inside a bracket node are not returned here; they hang off their
 * parent's `children`. Nor is anything inside a body, which is unscanned text
 * until whoever renders it decides to read it.
 *
 * A `[[` or `{{` preceded by a backslash is skipped, which is how a document
 * writes a literal one.
 *
 * @param content - The Markdown source.
 * @returns The top-level nodes. Text between them is not represented, because a
 *   caller reconstructs it from `source.start` and `source.end`.
 */
export function tokenizeShortcodes(content: string): ShortcodeNode[] {
  const nodes: ShortcodeNode[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const escaped = cursor > 0 && content[cursor - 1] === "\\";

    if (isAt(content, cursor, BRACKET_OPEN)) {
      if (escaped) {
        cursor += BRACKET_OPEN.length;
        continue;
      }
      const read = readBracketNode(content, cursor);
      if (read) {
        nodes.push(read.node);
        cursor = read.next;
        continue;
      }
      cursor += BRACKET_OPEN.length;
      continue;
    }

    if (isAt(content, cursor, BRACES_OPEN)) {
      if (escaped) {
        cursor += BRACES_OPEN.length;
        continue;
      }
      const read = readBracesNode(content, cursor);
      if (read) {
        nodes.push(read.node);
        cursor = read.next;
        continue;
      }
      cursor += BRACES_OPEN.length;
      continue;
    }

    cursor += 1;
  }

  return nodes;
}
