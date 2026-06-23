import type { ReactNode } from "react";

/**
 * Detects bare web URLs (`http(s)://…` or `www.…`) and email addresses inside a
 * plain-text run. Ordered so the explicit-scheme and `www.` URL forms win over
 * the email form at any given position (a URL can legally contain an `@`).
 */
const LINK_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

/**
 * Trailing characters that almost always belong to the surrounding prose rather
 * than the link itself (sentence punctuation, a closing bracket/quote). Stripped
 * back into the text so e.g. `see http://x.org.` does not swallow the full stop.
 */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"»]+$/;

/**
 * A matched run is an email (not a URL) when it carries an `@` and no path
 * separator — `foo@bar.com` qualifies, `http://x.com/u@v` does not. Tested once
 * per match instead of two substring scans (keeps the loop allocation-free).
 */
const EMAIL_LIKE = /^[^\s/]+@[^\s/]+$/;

/**
 * Anchor attributes for external web links: new tab, no referrer/opener leakage.
 * A plain config map (not an `as const` domain namespace) — `target` widens to
 * `string`, which is assignable to React's `HTMLAttributeAnchorTarget`.
 */
const EXTERNAL_LINK_ATTRS: { target: string; rel: string } = {
  target: "_blank",
  rel: "noopener noreferrer",
};

/**
 * Splits a plain-text string into a React node list where every detected web URL
 * or email address becomes an `<a class="mc-cardlink">` and the surrounding text
 * is preserved verbatim. Used to make artist-bio links clickable while keeping
 * the bio's Card-Link styling (colours + underline decoration).
 *
 * Web links open in a new tab (`target="_blank"` + `rel="noopener noreferrer"`);
 * email addresses become `mailto:` links without a target. URLs lacking a scheme
 * (`www.…`) are prefixed with `https://` for the `href` while the visible label
 * keeps the original text. Trailing sentence punctuation is excluded from the
 * link. When the input contains no link, the original text is returned as the
 * single node.
 *
 * @param text - The plain-text run to scan for links.
 * @returns An array of strings and `<a>` elements in original document order.
 */
export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    const label = match[0].replace(TRAILING_PUNCTUATION, "");
    if (!label) continue;

    if (start > cursor) nodes.push(text.slice(cursor, start));

    const isEmail = EMAIL_LIKE.test(label);
    const href = isEmail ? `mailto:${label}` : label.startsWith("http") ? label : `https://${label}`;
    nodes.push(
      <a key={`lnk-${key++}`} href={href} className="mc-cardlink" {...(isEmail ? {} : EXTERNAL_LINK_ATTRS)}>
        {label}
      </a>,
    );

    cursor = start + label.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
