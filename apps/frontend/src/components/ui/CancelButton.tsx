import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props for {@link CancelButton}. */
interface CancelButtonProps {
  /** Fired when the user clicks the button. */
  onClick: () => void;
  /** The button label (the localized cancel string). */
  children: ReactNode;
  /** Optional extra classes merged after the base recipe. */
  className?: string;
}

/**
 * The muted text-only "cancel" button shared by the discovery panels
 * (`DisambiguationPanel`, `GenreSearchResults`). A bare `<button>` with the
 * muted-to-secondary hover colour swap and the accent focus ring — no embossed
 * surface, deliberately less prominent than the primary affordances.
 *
 * Purely presentational: the surrounding layout wrapper (`mt-4`, centering)
 * stays at the call site, since the two panels position the button differently.
 */
export function CancelButton({ onClick, children, className }: CancelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-sm text-text-muted hover:text-text-secondary",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded",
        className,
      )}
    >
      {children}
    </button>
  );
}
