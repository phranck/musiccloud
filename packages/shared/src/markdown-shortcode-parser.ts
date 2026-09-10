/**
 * @file Resolves scanned nodes against the shortcode registry.
 *
 * The tokenizer knows what a shortcode looks like; this knows what one means.
 * It matches each node to its definition, reads every attribute as the type
 * that definition declares, fills in the defaults, and reports what does not
 * fit. A token nothing claims produces no shortcode at all, so its source is
 * left standing on the page as the text it is.
 */

import {
  type ShortcodeAttribute,
  type ShortcodeAttributeValue,
  type ShortcodeNode,
  ShortcodeSyntaxIssueCode,
  type ShortcodeSyntaxIssueCodeValue,
  tokenizeShortcodes,
} from "./markdown-shortcode-tokenizer.js";
import {
  SHORTCODE_DEFINITIONS,
  ShortcodeBodyRule,
  type ShortcodeDefinition,
  type ShortcodeParamDefinition,
  ShortcodeParamType,
  type ShortcodeParamValue,
  ShortcodeSyntax,
  ShortcodeTargetRule,
} from "./markdown-shortcodes/index.js";

/** What the parser reports when something does not fit its definition. */
export const ShortcodeIssueCode = {
  BodyForbidden: "BodyForbidden",
  InvalidAttribute: "InvalidAttribute",
  InvalidParam: "InvalidParam",
  MissingBody: "MissingBody",
  MissingParam: "MissingParam",
  MissingParamValue: "MissingParamValue",
  MissingTarget: "MissingTarget",
  TargetForbidden: "TargetForbidden",
  UnterminatedAttribute: "UnterminatedAttribute",
  UnterminatedBody: "UnterminatedBody",
} as const;

/** One of the codes in {@link ShortcodeIssueCode}. */
export type ShortcodeIssueCodeValue = (typeof ShortcodeIssueCode)[keyof typeof ShortcodeIssueCode];

/** Something about a shortcode that does not match its definition. */
export interface ShortcodeIssue {
  code: ShortcodeIssueCodeValue;
  message: string;
  /** Which attribute it is about, where it is about one. */
  attribute?: string;
}

/** One shortcode, read against its definition. */
export interface ParsedShortcode {
  token: string;
  definition: ShortcodeDefinition;
  target?: string;
  /** Every attribute as it was written, before any type was applied. */
  attributes: Record<string, ShortcodeAttributeValue>;
  rawAttributes: ShortcodeAttribute[];
  /** Every declared parameter that resolved, with its defaults filled in. */
  params: Record<string, ShortcodeParamValue>;
  /** Nodes nested inside this one, resolved against its own child list. */
  children: ParsedShortcode[];
  /** What the container carries, on a shortcode that takes a body. */
  body?: string;
  issues: ShortcodeIssue[];
  source: { start: number; end: number; raw: string };
}

/**
 * Finds an attribute by a parameter's name or by one of its aliases.
 *
 * @param attributes - Everything written on the node.
 * @param definition - The parameter being looked for.
 * @returns The value as written, or `undefined` when the attribute is absent.
 */
function findAttribute(
  attributes: Record<string, ShortcodeAttributeValue>,
  definition: ShortcodeParamDefinition,
): ShortcodeAttributeValue | undefined {
  if (definition.name in attributes) return attributes[definition.name];

  for (const alias of definition.aliases ?? []) {
    if (alias in attributes) return attributes[alias];
  }

  return undefined;
}

/**
 * Reads an integer parameter, respecting its declared bounds.
 *
 * @param definition - The parameter, for its `min` and `max`.
 * @param value - The attribute as written.
 * @returns The number, or `null` when it is not an integer or falls outside
 *   the bounds.
 */
function normalizeIntegerParam(definition: ShortcodeParamDefinition, value: string): number | null {
  if (!/^-?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  if (definition.min !== undefined && parsed < definition.min) return null;
  if (definition.max !== undefined && parsed > definition.max) return null;
  return parsed;
}

/**
 * Matches an enum value against the names its parameter declares.
 *
 * The comparison ignores a leading dot, any hyphens, underscores and spaces,
 * and the casing. SwiftUI writes `.topLeading`, so the dot belongs to the name
 * as much as the capital does, and `top-leading` is how the same name is spelt
 * everywhere else in a stylesheet. A name that works in one spelling only is
 * one to look up rather than one to remember.
 *
 * @param definition - The parameter.
 * @param value - The attribute as written.
 * @returns The name in the spelling the registry declares, so everything
 *   downstream compares against one form, or `null` when it names none.
 */
function matchEnumParam(definition: ShortcodeParamDefinition, value: string): string | null {
  const written = value
    .replace(/^\./, "")
    .replace(/[-_\s]/g, "")
    .toLowerCase();
  if (!written) return null;
  return definition.values?.find((name) => name.replace(/[-_\s]/g, "").toLowerCase() === written) ?? null;
}

/**
 * Reads one attribute as the type its parameter declares.
 *
 * @param definition - The parameter.
 * @param value - The attribute as written, or `true` for a bare flag.
 * @returns The typed value, or `null` when it does not fit.
 */
function normalizeParamValue(
  definition: ShortcodeParamDefinition,
  value: ShortcodeAttributeValue,
): ShortcodeParamValue | null {
  // A bare name carries no value, which only means something for a flag.
  if (value === true) {
    return definition.type === ShortcodeParamType.Boolean ? true : null;
  }

  const trimmed = value.trim();

  if (definition.type === ShortcodeParamType.String) return trimmed;

  if (definition.type === ShortcodeParamType.Integer) {
    return normalizeIntegerParam(definition, trimmed);
  }

  if (definition.type === ShortcodeParamType.Boolean) {
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    return null;
  }

  return matchEnumParam(definition, trimmed);
}

/**
 * Reads every declared parameter off a node.
 *
 * @param definition - The shortcode's definition.
 * @param attributes - Everything written on the node.
 * @returns The typed parameters and whatever did not fit.
 *
 * @remarks
 * An attribute the definition does not declare is ignored rather than
 * reported. Whoever wrote it may be typing, and a shortcode with an unknown
 * attribute still renders.
 */
function normalizeParams(
  definition: ShortcodeDefinition,
  attributes: Record<string, ShortcodeAttributeValue>,
): { params: Record<string, ShortcodeParamValue>; issues: ShortcodeIssue[] } {
  const params: Record<string, ShortcodeParamValue> = {};
  const issues: ShortcodeIssue[] = [];

  for (const paramDefinition of definition.params) {
    const rawValue = findAttribute(attributes, paramDefinition);

    if (rawValue === undefined) {
      if (paramDefinition.defaultValue !== undefined) {
        params[paramDefinition.name] = paramDefinition.defaultValue;
      } else if (paramDefinition.required) {
        issues.push({
          code: ShortcodeIssueCode.MissingParam,
          message: `Shortcode parameter "${paramDefinition.name}" is required.`,
          attribute: paramDefinition.name,
        });
      }
      continue;
    }

    const value = normalizeParamValue(paramDefinition, rawValue);
    if (value === null) {
      issues.push({
        code: rawValue === true ? ShortcodeIssueCode.MissingParamValue : ShortcodeIssueCode.InvalidParam,
        message: `Shortcode parameter "${paramDefinition.name}" is invalid.`,
        attribute: paramDefinition.name,
      });
      // The default still stands in, so one mistyped attribute does not take
      // the whole shortcode down with it.
      if (paramDefinition.defaultValue !== undefined) {
        params[paramDefinition.name] = paramDefinition.defaultValue;
      }
      continue;
    }

    params[paramDefinition.name] = value;
  }

  return { params, issues };
}

/**
 * Checks a node's target against what its definition allows.
 *
 * @param definition - The shortcode's definition.
 * @param target - What followed the colon, where anything did.
 * @returns The issue, or nothing.
 */
function validateTarget(definition: ShortcodeDefinition, target: string | undefined): ShortcodeIssue[] {
  if (definition.target === ShortcodeTargetRule.Required && !target) {
    return [
      {
        code: ShortcodeIssueCode.MissingTarget,
        message: `Shortcode "${definition.token}" needs a value after its colon.`,
      },
    ];
  }

  if (definition.target === ShortcodeTargetRule.Forbidden && target) {
    return [
      {
        code: ShortcodeIssueCode.TargetForbidden,
        message: `Shortcode "${definition.token}" takes no value after a colon.`,
      },
    ];
  }

  return [];
}

/**
 * Checks a node's body against what its definition allows.
 *
 * A body written on a shortcode that draws one thing is a misunderstanding
 * worth reporting rather than ignoring: the author expected the text to appear
 * and it would not.
 *
 * @param definition - The shortcode's definition.
 * @param body - What it carried, where it carried anything.
 * @returns The issue, or nothing.
 */
function validateBody(definition: ShortcodeDefinition, body: string | undefined): ShortcodeIssue[] {
  const takesBody = definition.body === ShortcodeBodyRule.Markdown;

  if (takesBody && body === undefined) {
    return [
      {
        code: ShortcodeIssueCode.MissingBody,
        message: `Shortcode "${definition.token}" needs content inside it.`,
      },
    ];
  }

  if (!takesBody && body !== undefined) {
    return [
      {
        code: ShortcodeIssueCode.BodyForbidden,
        message: `Shortcode "${definition.token}" carries no content.`,
      },
    ];
  }

  return [];
}

/**
 * Carries one of the scanner's findings over to this interface.
 *
 * The scanner reports an offset into the source, which has no place on a
 * resolved shortcode, so what survives is the code and the message.
 *
 * @param code - What the scanner reported.
 * @returns The matching parser code.
 */
function carryOverIssue(code: ShortcodeSyntaxIssueCodeValue): ShortcodeIssueCodeValue {
  if (code === ShortcodeSyntaxIssueCode.UnterminatedValue) return ShortcodeIssueCode.UnterminatedAttribute;
  if (code === ShortcodeSyntaxIssueCode.UnterminatedBody) return ShortcodeIssueCode.UnterminatedBody;
  return ShortcodeIssueCode.InvalidAttribute;
}

/**
 * Finds the definition a node belongs to.
 *
 * The braces form carries no token, so it is matched by its notation instead.
 * Only one shortcode may use that notation, which
 * `assertRegistryIsUnambiguous` holds the registry to as it loads.
 *
 * @param node - The scanned node.
 * @param definitions - What may appear at this position.
 * @returns The definition, or `undefined` when nothing claims it.
 */
function definitionFor(
  node: ShortcodeNode,
  definitions: readonly ShortcodeDefinition[],
): ShortcodeDefinition | undefined {
  if (node.syntax === ShortcodeSyntax.Braces) {
    return definitions.find((definition) => definition.syntax === ShortcodeSyntax.Braces);
  }

  return definitions.find((definition) => definition.token === node.token && definition.syntax === node.syntax);
}

/**
 * Resolves one node, and its children against that node's own child list.
 *
 * @param node - The scanned node.
 * @param definitions - What may appear at this position, which for a child is
 *   its parent's child list rather than the document's registry.
 * @returns The resolved shortcode, or `null` when no definition claims it.
 */
function resolveNode(node: ShortcodeNode, definitions: readonly ShortcodeDefinition[]): ParsedShortcode | null {
  const definition = definitionFor(node, definitions);
  if (!definition) return null;

  const { params, issues: paramIssues } = normalizeParams(definition, node.attributes);

  const children: ParsedShortcode[] = [];
  for (const child of node.children) {
    const resolved = resolveNode(child, definition.children ?? []);
    if (resolved) children.push(resolved);
  }

  return {
    token: definition.token,
    definition,
    target: node.target,
    attributes: node.attributes,
    rawAttributes: node.rawAttributes,
    params,
    children,
    body: node.body,
    issues: [
      ...validateTarget(definition, node.target),
      ...validateBody(definition, node.body),
      ...node.issues.map((issue) => ({ code: carryOverIssue(issue.code), message: issue.message })),
      ...paramIssues,
    ],
    source: node.source,
  };
}

/**
 * Parses every shortcode in `content`.
 *
 * Only top-level shortcodes are returned. A nested one hangs off its parent's
 * `children`, resolved against that parent's own child list, so a token means
 * what its position says it means.
 *
 * @param content - The Markdown source.
 * @param definitions - What top-level tokens are resolved against. Pass the
 *   list for one content context to parse a page the way that context renders
 *   it.
 * @returns The shortcodes found, in the order they appear.
 */
export function parseShortcodes(
  content: string,
  definitions: readonly ShortcodeDefinition[] = SHORTCODE_DEFINITIONS,
): ParsedShortcode[] {
  const parsed: ParsedShortcode[] = [];

  for (const node of tokenizeShortcodes(content)) {
    const resolved = resolveNode(node, definitions);
    if (resolved) parsed.push(resolved);
  }

  return parsed;
}
