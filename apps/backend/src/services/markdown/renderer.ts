import {
  ContentContext,
  hasAllContextBits,
  type SingleContentContext,
  type SiteVariableValues,
} from "@musiccloud/shared";
import { Marked } from "marked";
import { resetContainerDepth } from "./containers.js";
import { MARKDOWN_EXTENSION_REGISTRY, type MarkdownExtensionRegistry } from "./extension-registry.js";
import { resetHeadingIds } from "./heading-anchors.js";
import { type MarkdownRenderOptions, SITE_VALUES_OPTION } from "./support-ladder-extension.js";
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
    .map((definition) => definition.createMarkedExtension(context));
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
  siteValues: SiteVariableValues | undefined,
): Promise<string> {
  const cached = getCachedMarkdownRenderer(context, registry);
  const previousRender = cached.queue;
  let releaseQueue!: () => void;
  cached.queue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousRender;
  try {
    // The site variables travel as a parse option, which marked hands to every
    // extension of this one render, so the renderer cached across renders
    // carries none of them.
    const options: MarkdownRenderOptions = { async: true, [SITE_VALUES_OPTION]: siteValues };
    return await cached.renderer.parse(markdown, options);
  } finally {
    releaseQueue();
  }
}

/**
 * Renders a page body to HTML for one surface.
 *
 * @param markdown - The body, with site variables already expanded.
 * @param context - The one surface it is rendered for.
 * @param registry - The extensions to render with, the production registry by default.
 * @param siteValues - The render's site variables, which the support ladder
 *   reads its payee and sponsor minimum from. Without them the ladder draws no
 *   transfer card.
 * @returns The HTML, not yet sanitized.
 * @throws MarkdownContextError when the body uses a shortcode the surface does not allow.
 */
export async function renderMarkdown(
  markdown: string,
  context: SingleContentContext,
  registry: MarkdownExtensionRegistry = MARKDOWN_EXTENSION_REGISTRY,
  siteValues?: SiteVariableValues,
): Promise<string> {
  assertSingleContentContext(context);
  if (!markdown || !markdown.trim()) return "";

  const validation = validateMarkdownForContexts(markdown, context, registry);
  if (!validation.ok) throw new MarkdownContextError(validation.errors);

  // Heading anchors are numbered within one document, so the count starts over
  // here. Otherwise a second page saying "Overview" would get "overview-2" and
  // a link written against the first page would miss.
  resetHeadingIds();
  // Likewise the nesting counter, so a render that threw part-way through a
  // card cannot leave the next one thinking it is already deep.
  resetContainerDepth();

  try {
    return await parseWithContextRenderer(markdown, context, registry, siteValues);
  } catch (error) {
    console.error("[renderBody] marked.parse threw, falling back to escaped text:", error);
    return `<pre>${escapeHtml(markdown)}</pre>`;
  }
}
