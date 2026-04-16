import { ArrowLeftIcon } from "@phosphor-icons/react";
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
 * Subtle text-link back button — chevron-left icon plus translated label.
 * Used above the share layout when the user reached a result via the
 * genre-search discovery list, giving them a visible way back to that
 * list.
 *
 * Styled to match the "cancel" links used elsewhere (disambiguation,
 * genre-search panel): muted text colour, accent focus ring, no emboss
 * so it stays out of the way of the main result content.
 */
export function BackLink({ onClick, label, className }: BackLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
        className,
      )}
    >
      <ArrowLeftIcon size={14} weight="duotone" />
      {label}
    </button>
  );
}
