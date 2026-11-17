/**
 * @file Turns a stored page body into the HTML a surface shows.
 *
 * The site and the developer portal both show page bodies, and both reach them
 * through this one function, so a body gets the same treatment wherever it
 * appears. It sits beside `site-variables.ts` rather than in `markdown/`,
 * because the variables are read from the database and nothing in `markdown/`
 * touches the database.
 */
import { expandSiteVariables, type SingleContentContext, type SiteVariableValues } from "@musiccloud/shared";
import { MARKDOWN_EXTENSION_REGISTRY } from "./markdown/extension-registry.js";
import { type MarkdownBodyOptions, renderMarkdown } from "./markdown/renderer.js";
import { sanitizeMarkdownHtml } from "./markdown/sanitizer.js";
import { bindSupportLadderSettings } from "./markdown/support-ladder-extension.js";
import { resolveSiteVariableValues } from "./site-variables.js";

/**
 * Renders a stored page body for one surface, with the site variables given.
 *
 * Variables are expanded before the Markdown is parsed, so a name works
 * wherever a person can type it: in prose, in a heading, and inside a
 * shortcode's attribute alike. The same values reach the render, which names
 * the transfer purposes a support ladder leaves out. The result is sanitized,
 * because Markdown passes raw HTML through and both surfaces inject the string
 * as it stands. Every support ladder is then bound to the sponsoring settings,
 * so no page can name who is paid.
 *
 * @param content - The stored body; `null`, `undefined` or blank renders to an empty string.
 * @param context - The one surface the body is rendered for.
 * @param siteValues - The site variables, as {@link resolveSiteVariableValues} reads them.
 * @param bodyOptions - How the source is read, a page body's reading by default.
 * @returns HTML restricted to the sanitizer's allowlist.
 */
export async function renderEditorialBodyWith(
  content: string | null | undefined,
  context: SingleContentContext,
  siteValues: SiteVariableValues,
  bodyOptions: MarkdownBodyOptions = {},
): Promise<string> {
  const expanded = expandSiteVariables(content ?? "", siteValues);
  const html = sanitizeMarkdownHtml(
    await renderMarkdown(expanded, context, MARKDOWN_EXTENSION_REGISTRY, siteValues, bodyOptions),
  );
  return bindSupportLadderSettings(html, siteValues);
}

/**
 * Renders a stored page body for one surface, with the site variables as they
 * stand now.
 *
 * @param content - The stored body; `null`, `undefined` or blank renders to an empty string.
 * @param context - The one surface the body is rendered for.
 * @returns HTML restricted to the sanitizer's allowlist.
 */
export async function renderEditorialBody(
  content: string | null | undefined,
  context: SingleContentContext,
): Promise<string> {
  return renderEditorialBodyWith(content, context, await resolveSiteVariableValues());
}
