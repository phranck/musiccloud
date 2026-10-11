/**
 * @file Turns a stored page body into the HTML a surface shows.
 *
 * The site and the developer portal both show page bodies, and both reach them
 * through this one function, so a body gets the same treatment wherever it
 * appears. It sits beside `site-variables.ts` rather than in `markdown/`,
 * because the variables are read from the database and nothing in `markdown/`
 * touches the database.
 */
import { expandSiteVariables, type SingleContentContext } from "@musiccloud/shared";
import { renderMarkdown } from "./markdown/renderer.js";
import { sanitizeMarkdownHtml } from "./markdown/sanitizer.js";
import { resolveSiteVariableValues } from "./site-variables.js";

/**
 * Renders a stored page body for one surface.
 *
 * Variables are expanded before the Markdown is parsed, so a name works
 * wherever a person can type it: in prose, in a heading, and inside a
 * shortcode's attribute alike. The result is sanitized last, because Markdown
 * passes raw HTML through and both surfaces inject the string as it stands.
 *
 * @param content - The stored body; `null`, `undefined` or blank renders to an empty string.
 * @param context - The one surface the body is rendered for.
 * @returns HTML restricted to the sanitizer's allowlist.
 */
export async function renderEditorialBody(
  content: string | null | undefined,
  context: SingleContentContext,
): Promise<string> {
  const expanded = expandSiteVariables(content ?? "", await resolveSiteVariableValues());
  return sanitizeMarkdownHtml(await renderMarkdown(expanded, context));
}
