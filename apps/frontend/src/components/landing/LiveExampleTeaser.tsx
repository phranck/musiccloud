import { CardSignal, sendMusicSignal } from "@/lib/analytics/umami";

interface LiveExampleTeaserProps {
  /** Short ID of the example share page the link points to. */
  exampleShortId: string;
  /** Visible, translated link label. */
  label: string;
  /** Translated lead-in text shown before the link. */
  teaser: string;
  /** Whether the teaser is shown; when false it fades out and is hidden from a11y. */
  visible: boolean;
}

/**
 * One-line teaser beneath the hero that links to a live example share page.
 *
 * Stays mounted and toggles its opacity (rather than unmounting) so the layout
 * does not jump and the fade is smooth; when hidden it is also removed from the
 * accessibility tree and made non-interactive. The link click emits a
 * {@link CardSignal.LiveExample} analytics signal.
 *
 * @param exampleShortId - Short ID for the `/{shortId}` example link.
 * @param label - Visible link label.
 * @param teaser - Lead-in text before the link.
 * @param visible - Whether the teaser is currently shown.
 */
export function LiveExampleTeaser({ exampleShortId, label, teaser, visible }: LiveExampleTeaserProps) {
  return (
    <p
      className={`mt-4 min-h-5 text-sm text-text-secondary text-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      {teaser}{" "}
      <a href={`/${exampleShortId}`} onClick={() => sendMusicSignal(CardSignal.LiveExample)} className="mc-skylink">
        {label}
      </a>
    </p>
  );
}
