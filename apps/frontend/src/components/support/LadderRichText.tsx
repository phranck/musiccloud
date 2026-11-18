/**
 * @file One of the support ladder's rendered text fields.
 */

import parse from "html-react-parser";

/** Props of {@link LadderRichText}. */
interface LadderRichTextProps {
  /** Rendered HTML, sanitized by the backend and read back by the shared reader. */
  html: string;
  /** Classes of the wrapper. */
  className?: string;
  /** The wrapper's role, such as `status` for a notice that appears while typing. */
  role?: string;
  /**
   * How far the text is drawn in on both sides, for text standing on the page
   * above a rounded surface: `cardTextInset` above a card, `recessedTextInset`
   * above a well, both from `cardGeometry.ts`. No inset where absent, which is
   * right inside a padded card and for text with nothing rounded beneath it.
   */
  inset?: string;
}

/**
 * One of the ladder's text fields, rendered the way the rest of the page is.
 *
 * The text arrives as HTML that went through the page's own sanitizer, and it is
 * parsed into elements by the same parser `MarkdownHtml` uses rather than
 * injected.
 *
 * @param props - See {@link LadderRichTextProps}.
 * @returns The text, or nothing when it is empty.
 */
export function LadderRichText({ html, className, role, inset }: LadderRichTextProps) {
  if (!html) return null;
  return (
    <div role={role} className={className} style={inset ? { paddingInline: inset } : undefined}>
      {parse(html)}
    </div>
  );
}
