import { TWO_COLUMN_TOTAL_W } from "@/components/share/TwoColumnResultGrid";
import { BackLink } from "@/components/ui/BackLink";

/** Props for {@link ShareBackLink}. */
interface ShareBackLinkProps {
  /** Translated label for the back link. Required for the link to render. */
  label?: string;
  /** Back action. Required for the link to render. */
  onBack?: () => void;
}

/**
 * Renders a subtle "back" link above the share cards, width-aligned to the
 * two-column result grid.
 *
 * Shown only when both an `onBack` action and a `label` are supplied (e.g. when
 * the user arrived from genre-search discovery); otherwise renders nothing.
 *
 * @param props - {@link ShareBackLinkProps}.
 */
export function ShareBackLink({ label, onBack }: ShareBackLinkProps) {
  if (!onBack || !label) return null;

  return (
    <div className="mx-auto mb-3 min-[1080px]:mb-4" style={{ maxWidth: `${TWO_COLUMN_TOTAL_W}px` }}>
      <BackLink onClick={onBack} label={label} />
    </div>
  );
}
