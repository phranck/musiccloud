import { decodeHtmlEntities, escapeHtml } from "../../../lib/html.js";

/**
 * Private-use sentinels wrapping an anchor index. They survive both entity
 * decoding and HTML escaping (neither touches these code points), so a preserved
 * link can be carried past the escape step and restored as real `<a>` markup.
 */
const ANCHOR_OPEN = String.fromCharCode(0xe000);
const ANCHOR_CLOSE = String.fromCharCode(0xe001);

/** Matches an `<a …href="URL"…>INNER</a>` element (double- or single-quoted href). */
const ANCHOR_RE = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Normalises a bio link `href` to a safe, canonical form, or `null` when the
 * scheme is not allowed.
 *
 * Allowed schemes: `http`/`https` — forced to `https`, a leading `www.` dropped —
 * and `mailto:`. Everything else (`javascript:`, `data:`, protocol-relative, …)
 * is rejected so no unsafe URL ever reaches the rendered anchor.
 *
 * @param raw - The raw `href` attribute value.
 * @returns The normalised href, or `null` to drop the link (keeping its text).
 */
function normalizeBioHref(raw: string): string | null {
  const href = raw.trim();
  if (/^mailto:/i.test(href)) return href;
  if (/^https?:\/\//i.test(href)) {
    return href.replace(/^http:\/\//i, "https://").replace(/^(https:\/\/)www\./i, "$1");
  }
  return null;
}

/** Strips inner tags from an anchor's content and decodes entities to plain text. */
function anchorText(inner: string): string {
  return decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim();
}

/**
 * Converts a Jamendo artist `description` (loose, untrusted user HTML — only
 * paragraphs, line breaks, and links in practice) into a safe HTML string of
 * escaped `<p>`/`<br>` paragraphs, ready to render through the frontend's
 * `MarkdownHtml` pipeline.
 *
 * Safety: every tag is stripped to plain text except `<a>` elements with a
 * safe `href` ({@link normalizeBioHref}) — those are preserved as minimal
 * `<a href="…">text</a>` markup (all other attributes dropped, href + text
 * HTML-escaped), so artist-provided links survive while no script, style, or
 * event-handler markup does. The frontend then styles and normalises the
 * anchors (handle-only links, brand display).
 *
 * @param rawHtml - The raw Jamendo description, possibly `null`/`undefined`.
 * @returns Safe paragraph HTML, or `null` when there is no text content.
 */
export function jamendoBioToHtml(rawHtml: string | null | undefined): string | null {
  if (!rawHtml) return null;

  const anchors: Array<{ href: string; text: string }> = [];
  const withoutTags = rawHtml
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(ANCHOR_RE, (_match, href: string, inner: string) => {
      const safeHref = normalizeBioHref(href);
      const text = anchorText(inner);
      if (!safeHref) return text; // unsafe scheme → keep the text, drop the link
      const index = anchors.push({ href: safeHref, text: text || safeHref }) - 1;
      return `${ANCHOR_OPEN}${index}${ANCHOR_CLOSE}`;
    })
    .replace(/<[^>]+>/g, "");

  const decoded = decodeHtmlEntities(withoutTags).trim();
  const paragraphs = decoded
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  const placeholderRe = new RegExp(`${ANCHOR_OPEN}(\\d+)${ANCHOR_CLOSE}`, "g");
  return paragraphs
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(/\n/g, "<br>");
      const withAnchors = escaped.replace(placeholderRe, (_match, index: string) => {
        const anchor = anchors[Number(index)];
        return `<a href="${escapeHtml(anchor.href)}">${escapeHtml(anchor.text)}</a>`;
      });
      return `<p>${withAnchors}</p>`;
    })
    .join("");
}
