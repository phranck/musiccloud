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
 * Single-line teaser linking to a live example share page, centered beneath the
 * hero: the lead-in and the link side by side, separated by a gap.
 *
 * Stays mounted and toggles its opacity (rather than unmounting) so the layout
 * does not jump and the fade is smooth; when hidden it is also removed from the
 * accessibility tree and made non-interactive. The link click emits a
 * {@link CardSignal.LiveExample} analytics signal.
 *
 * @param exampleShortId - Short ID for the `/{shortId}` example link.
 * @param label - Visible link label.
 * @param teaser - Lead-in text shown before the link.
 * @param visible - Whether the teaser is currently shown.
 */
export function LiveExampleTeaser({ exampleShortId, label, teaser, visible }: LiveExampleTeaserProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-text-secondary transition-opacity duration-200 ${
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
