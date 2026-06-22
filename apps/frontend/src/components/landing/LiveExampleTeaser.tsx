import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface LiveExampleTeaserProps {
  /** Short ID of the example share page the link points to. */
  exampleShortId: string;
  /** Visible, translated link label. */
  label: string;
  /** Translated lead-in text shown above the link. */
  teaser: string;
  /** Whether the teaser is shown; when false it fades out and is hidden from a11y. */
  visible: boolean;
}

/**
 * Two-line teaser linking to a live example share page, shown next to the
 * resolve-mode switch beneath the hero: the lead-in on the first line, the link
 * on the second, left-aligned so both align to the switch on their left.
 *
 * Stays mounted and toggles its opacity (rather than unmounting) so the layout
 * does not jump and the fade is smooth; when hidden it is also removed from the
 * accessibility tree and made non-interactive. The link click emits a
 * {@link CardSignal.LiveExample} analytics signal.
 *
 * @param exampleShortId - Short ID for the `/{shortId}` example link.
 * @param label - Visible link label.
 * @param teaser - Lead-in text above the link.
 * @param visible - Whether the teaser is currently shown.
 */
export function LiveExampleTeaser({ exampleShortId, label, teaser, visible }: LiveExampleTeaserProps) {
  return (
    <div
      className={`text-sm text-text-secondary text-left leading-snug transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <p>{teaser}</p>
      <a href={`/${exampleShortId}`} onClick={() => sendMusicSignal(CardSignal.LiveExample)} className="mc-skylink">
        {label}
      </a>
    </div>
  );
}
