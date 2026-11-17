import { RecessedOrPlainMarkdown } from "@/components/layout/RecessedOrPlainMarkdown";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";

/** Padding of the recessed card around a fullscreen page's body. */
const RECESSED_CONTENT_PADDING = "px-6 py-6";

/** Props of {@link ContentPageMarkdown}. */
interface ContentPageMarkdownProps {
  /** The page's rendered body, sanitized by the backend. */
  html: string;
  /** Whether the page asks for its body in a recessed card. */
  recessed: boolean;
  /** The prose class-map of the surface. */
  className: string;
}

/**
 * The body of a fullscreen content page, in its card where the page asks for one.
 *
 * The card and the body are one island, because Astro renders what it passes
 * into an island as static markup. A body handed into a hydrated card that way
 * would never hydrate, and the components it mounts, such as a video or the
 * support ladder, would not respond.
 *
 * @param props - See {@link ContentPageMarkdownProps}.
 * @returns The body.
 */
export function ContentPageMarkdown({ html, recessed, className }: ContentPageMarkdownProps) {
  return (
    <RecessedOrPlainMarkdown recessed={recessed} contentClassName={recessed ? RECESSED_CONTENT_PADDING : ""}>
      <MarkdownHtml html={html} className={className} />
    </RecessedOrPlainMarkdown>
  );
}
