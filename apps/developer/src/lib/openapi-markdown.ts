/**
 * Safe Markdown rendering for OpenAPI prose.
 *
 * OpenAPI descriptions are authored as Markdown but must never become a raw
 * HTML injection surface. Marked escapes normal text; this renderer also
 * escapes explicit HTML tokens and restricts link protocols before the result
 * is passed to Astro's `set:html` directive.
 */
import { marked, Renderer } from "marked";

const PROTECTED_MARKDOWN_TOKENS = /```[\s\S]*?```|`[^`\n]+`|\[[^\]]*]\([^)]*\)|<https?:\/\/[^>]+>/g;
const TECHNICAL_DESCRIPTION_PATTERNS = [
  /(?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+)?\/(?:api\/v\d+|health)\/[A-Za-z0-9_./:{}-]*[A-Za-z0-9_{}-]/g,
  /https?:\/\/[^\s`<>()\],.;]+/g,
  /\b(?:application|audio|image|text)\/[A-Za-z0-9.+-]+\b/g,
  /\b(?:X-API-Key|Content-Range|Content-Type|Retry-After)\b/g,
  /\b(?:ISO-8601|RFC 3339|YYYY-MM-DD(?:THH:mm:ss(?:\.SSS)?Z)?)\b/g,
  /\b(?:string|number|integer|boolean|object|array|null|binary|true|false)\b/g,
  /\b[a-z][A-Za-z0-9_]*:\s*"[a-z0-9][a-z0-9_-]*"/g,
] as const;
const OpenApiMarkdownTokenType = {
  Text: "text",
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeHref(value: string): string | undefined {
  const href = value.trim();
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  return undefined;
}

function createSafeRenderer(): Renderer {
  const renderer = new Renderer();

  // Explicit HTML in an API description is displayed as prose, never executed.
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.link = ({ href, title, tokens }) => {
    const content = renderer.parser.parseInline(tokens);
    const safeLink = safeHref(href);
    if (!safeLink) return content;

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a class="content-link text-fg" href="${escapeHtml(safeLink)}"${titleAttribute}>${content}</a>`;
  };
  renderer.image = ({ text, tokens }) =>
    renderer.parser.parseInline(tokens ?? [{ type: OpenApiMarkdownTokenType.Text, raw: text, text }]);

  return renderer;
}

function formatTechnicalDescriptionValues(markdown: string): string {
  const formatPlainText = (text: string): string => {
    const values: string[] = [];
    let formatted = text;

    for (const pattern of TECHNICAL_DESCRIPTION_PATTERNS) {
      formatted = formatted.replace(pattern, (value) => {
        const placeholder = `\uE000${values.length}\uE001`;
        values.push(value);
        return placeholder;
      });
    }

    return formatted.replace(/\uE000(\d+)\uE001/g, (_, index: string) => `\`${values[Number(index)]}\``);
  };

  let cursor = 0;
  let formatted = "";

  for (const match of markdown.matchAll(PROTECTED_MARKDOWN_TOKENS)) {
    const start = match.index ?? cursor;
    formatted += formatPlainText(markdown.slice(cursor, start));
    formatted += match[0];
    cursor = start + match[0].length;
  }

  return formatted + formatPlainText(markdown.slice(cursor));
}

/** Renders supported Markdown into sanitized HTML for OpenAPI descriptions. */
export function renderOpenApiMarkdown(markdown: string): string {
  return marked(formatTechnicalDescriptionValues(markdown), {
    async: false,
    gfm: true,
    renderer: createSafeRenderer(),
  });
}
