import type { ReactNode } from "react";
import { EXTERNAL_LINK_ATTRS, linkify } from "@/lib/linkify";

/** A social `@handle` token inside an anchor's label (e.g. `Instagram: @TamaraLaurel`). */
const SOCIAL_HANDLE_RE = /@[A-Za-z0-9._]+/;

/** Props for {@link BioAnchor}. */
interface BioAnchorProps {
  /** The anchor's (already backend-sanitised) href. */
  rawHref: string;
  /** The anchor's visible label text. */
  text: string;
}

/**
 * Renders a real `<a href>` that survived bio sanitisation (artist-provided link)
 * as a Card-Link:
 * - `mailto:` → the label as a `mailto:` link.
 * - Label carrying a social `@handle` (e.g. `Instagram: @TamaraLaurel`) → the label
 *   text is kept and only the `@handle` becomes the link, pointing at `href`.
 * - Otherwise → the `href` itself is linkified into its brand display (social
 *   `host/@handle`, bare `domain.tld`, or platform logo).
 *
 * The href is trusted to be backend-normalised (https, no `www.`); a scheme guard
 * keeps anything but `http(s)`/`mailto` from rendering as a link.
 *
 * @param props - {@link BioAnchorProps}.
 * @returns The rendered node.
 */
export function BioAnchor({ rawHref, text }: BioAnchorProps): ReactNode {
  const href = rawHref.trim();
  if (!/^(https?:|mailto:)/i.test(href)) return text;

  if (/^mailto:/i.test(href)) {
    return (
      <a href={href} className="mc-cardlink">
        {text}
      </a>
    );
  }

  const handle = text.match(SOCIAL_HANDLE_RE);
  if (handle && handle.index !== undefined) {
    return (
      <span>
        {text.slice(0, handle.index)}
        <a href={href} className="mc-cardlink" {...EXTERNAL_LINK_ATTRS}>
          {handle[0]}
        </a>
        {text.slice(handle.index + handle[0].length)}
      </span>
    );
  }

  return <>{linkify(href)}</>;
}
