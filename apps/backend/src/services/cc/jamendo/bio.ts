import { decodeHtmlEntities, escapeHtml } from "../../../lib/html.js";

/**
 * Converts a Jamendo artist `description` (loose, untrusted user HTML — only
 * paragraphs and line breaks in practice) into a safe HTML string of escaped
 * `<p>`/`<br>` paragraphs, ready to render through the frontend's `MarkdownHtml`
 * pipeline.
 *
 * Safety: every original tag is stripped to plain text first, entities are
 * decoded, and the resulting text is HTML-escaped before being re-wrapped — so
 * no raw user markup survives (no script, style, or event-handler attributes).
 *
 * @param rawHtml - The raw Jamendo description, possibly `null`/`undefined`.
 * @returns Safe paragraph HTML, or `null` when there is no text content.
 */
export function jamendoBioToHtml(rawHtml: string | null | undefined): string | null {
  if (!rawHtml) return null;
  const text = decodeHtmlEntities(
    rawHtml
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}
