import { ContentContext, hasAllContextBits, type SingleContentContext } from "@musiccloud/shared";
import { Marked } from "marked";
import { MARKDOWN_EXTENSION_REGISTRY, type MarkdownExtensionRegistry } from "./extension-registry.js";
import { MarkdownContextError, validateMarkdownForContexts } from "./validation.js";

interface CachedMarkdownRenderer {
  renderer: Marked;
  queue: Promise<void>;
}

const rendererCache = new WeakMap<MarkdownExtensionRegistry, Map<SingleContentContext, CachedMarkdownRenderer>>();

function assertSingleContentContext(context: SingleContentContext): void {
  if (context !== ContentContext.Frontend && context !== ContentContext.DeveloperPortal) {
    throw new RangeError(`Markdown rendering requires one concrete content context: ${context}`);
  }
}

function createMarkdownRenderer(context: SingleContentContext, registry: MarkdownExtensionRegistry): Marked {
  const extensions = registry.definitions
    .filter((definition) => hasAllContextBits(definition.allowedContextMask, context))
    .map((definition) => definition.createMarkedExtension());
  return new Marked(...extensions);
}

function getCachedMarkdownRenderer(
  context: SingleContentContext,
  registry: MarkdownExtensionRegistry,
): CachedMarkdownRenderer {
  let renderers = rendererCache.get(registry);
  if (!renderers) {
    renderers = new Map();
    rendererCache.set(registry, renderers);
  }

  let cached = renderers.get(context);
  if (!cached) {
    cached = { renderer: createMarkdownRenderer(context, registry), queue: Promise.resolve() };
    renderers.set(context, cached);
  }
  return cached;
}

export function getMarkdownRenderer(
  context: SingleContentContext,
  registry: MarkdownExtensionRegistry = MARKDOWN_EXTENSION_REGISTRY,
): Marked {
  assertSingleContentContext(context);
  return getCachedMarkdownRenderer(context, registry).renderer;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function parseWithContextRenderer(
  markdown: string,
  context: SingleContentContext,
  registry: MarkdownExtensionRegistry,
): Promise<string> {
  const cached = getCachedMarkdownRenderer(context, registry);
  const previousRender = cached.queue;
  let releaseQueue!: () => void;
  cached.queue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousRender;
  try {
    return await cached.renderer.parse(markdown, { async: true });
  } finally {
    releaseQueue();
  }
}

export async function renderMarkdown(
  markdown: string,
  context: SingleContentContext,
  registry: MarkdownExtensionRegistry = MARKDOWN_EXTENSION_REGISTRY,
): Promise<string> {
  assertSingleContentContext(context);
  if (!markdown || !markdown.trim()) return "";

  const validation = validateMarkdownForContexts(markdown, context, registry);
  if (!validation.ok) throw new MarkdownContextError(validation.errors);

  try {
    return await parseWithContextRenderer(markdown, context, registry);
  } catch (error) {
    console.error("[renderBody] marked.parse threw, falling back to escaped text:", error);
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }
}
