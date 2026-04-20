import { ArrowFatLinesLeftIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface BackLinkProps {
  /** Fires when the user activates the link (click or keyboard). */
  onClick: () => void;
  /** Visible, translated label. Also used as `aria-label` on the button. */
  label: string;
  /** Optional extra classes on the outer `<button>` (e.g. for margin). */
  className?: string;
}

/**
 * Subtle text-link back button used above the share layout when the user
 * reached a result via genre-search discovery. Indented by the MediaCard's
 * corner radius so it sits flush with the card's inner content edge.
 */
export function BackLink({ onClick, label, className }: BackLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        // Indent by half the MediaCard corner radius: 18px on sm+, 8px on mobile
        "pl-2 sm:pl-[18px]",
        "inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
        className,
      )}
    >
      <ArrowFatLinesLeftIcon size={16} weight="duotone" />
      {label}
    </button>
  );
}
