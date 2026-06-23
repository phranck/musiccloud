import { PLATFORM_CONFIG } from "@musiccloud/shared";
import type { ReactNode } from "react";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { type BioLink, BioLinkKind, resolveBioLink } from "@/lib/bio/bioLink";

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
 * Anchor attributes for external web links: new tab, no referrer/opener leakage.
 * A plain config map (not an `as const` domain namespace) — `target` widens to
 * `string`, which is assignable to React's `HTMLAttributeAnchorTarget`.
 */
const EXTERNAL_LINK_ATTRS: { target: string; rel: string } = {
  target: "_blank",
  rel: "noopener noreferrer",
};

/**
 * Renders one classified {@link BioLink} into a node:
 * - `Platform` → the brand logo icon only (no underline), linked + labelled.
 * - `Email` → a `mailto:` Card-Link (no new tab).
 * - `Social` / `Web` → a Card-Link showing the normalised `host/@handle` or `domain.tld`.
 *
 * @param link - The classified link.
 * @param key - Stable React list key.
 * @returns The rendered anchor node.
 */
function renderBioLink(link: BioLink, key: string): ReactNode {
  switch (link.kind) {
    case BioLinkKind.Platform:
      return (
        <a
          key={key}
          href={link.href}
          className="mx-0.5 inline-flex items-center align-middle transition-opacity hover:opacity-80"
          aria-label={PLATFORM_CONFIG[link.service].label}
          {...EXTERNAL_LINK_ATTRS}
        >
          <PlatformIcon platform={link.service} colored className="size-5" />
        </a>
      );
    case BioLinkKind.Email:
      return (
        <a key={key} href={link.href} className="mc-cardlink">
          {link.label}
        </a>
      );
    default:
      return (
        <a key={key} href={link.href} className="mc-cardlink" {...EXTERNAL_LINK_ATTRS}>
          {link.label}
        </a>
      );
  }
}

/**
 * Splits a plain-text string into a React node list where every detected link is
 * rendered per its kind (commercial-platform logo, social `host/@handle`, bare
 * `domain.tld`, or `mailto:`) and the surrounding text is preserved verbatim.
 * Used to make artist-bio links clickable with the bio's Card-Link styling.
 *
 * Classification (scheme-less `www.…` URLs gain an `https://` href, trailing
 * sentence punctuation is excluded) is delegated to {@link resolveBioLink}. When
 * the input contains no link, the original text is returned as the single node.
 *
 * @param text - The plain-text run to scan for links.
 * @returns An array of strings and anchor elements in original document order.
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
    nodes.push(renderBioLink(resolveBioLink(label), `lnk-${key++}`));
    cursor = start + label.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
