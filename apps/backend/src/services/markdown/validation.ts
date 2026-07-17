import {
  ContentContext,
  type ContentContextMask,
  hasAllContextBits,
  isValidContentContextMask,
} from "@musiccloud/shared";
import { Marked } from "marked";
import { MARKDOWN_EXTENSION_REGISTRY, type MarkdownExtensionRegistry } from "./extension-registry.js";

export interface MarkdownValidationError {
  extension: string;
  allowedContextMask: ContentContextMask;
}

export type MarkdownValidationResult = { ok: true; errors: [] } | { ok: false; errors: MarkdownValidationError[] };

function describeContextMask(mask: ContentContextMask): string {
  if (mask === ContentContext.Frontend) return "Frontend";
  if (mask === ContentContext.DeveloperPortal) return "Developer Portal";
  return "Frontend and Developer Portal";
}

export class MarkdownContextError extends Error {
  readonly code = "MC-CONTENT-MARKDOWN-CONTEXT";

  constructor(readonly errors: MarkdownValidationError[]) {
    const detail = errors
      .map(
        ({ extension, allowedContextMask }) =>
          `Markdown extension "${extension}" is only allowed in ${describeContextMask(allowedContextMask)}`,
      )
      .join("; ");
    super(detail);
    this.name = "MarkdownContextError";
  }
}

function collectTokenTypes(value: unknown, tokenTypes: Set<string>, visited: WeakSet<object>): void {
  if (typeof value !== "object" || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectTokenTypes(item, tokenTypes, visited);
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.type === "string") tokenTypes.add(record.type);
  for (const child of Object.values(record)) {
    collectTokenTypes(child, tokenTypes, visited);
  }
}

function findUsedTokenTypes(markdown: string, registry: MarkdownExtensionRegistry): Set<string> {
  const parser = new Marked(...registry.definitions.map(({ createMarkedExtension }) => createMarkedExtension()));
  const tokenTypes = new Set<string>();
  collectTokenTypes(parser.lexer(markdown), tokenTypes, new WeakSet());
  return tokenTypes;
}

export function validateMarkdownForContexts(
  markdown: string,
  contextMask: ContentContextMask,
  registry: MarkdownExtensionRegistry = MARKDOWN_EXTENSION_REGISTRY,
): MarkdownValidationResult {
  if (!isValidContentContextMask(contextMask)) {
    throw new RangeError(`Invalid content context mask: ${contextMask}`);
  }

  const usedTokenTypes = findUsedTokenTypes(markdown, registry);
  const errors = registry.definitions
    .filter((definition) => definition.tokenTypes.some((tokenType) => usedTokenTypes.has(tokenType)))
    .filter((definition) => !hasAllContextBits(definition.allowedContextMask, contextMask))
    .map(({ name, allowedContextMask }) => ({ extension: name, allowedContextMask }));

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
