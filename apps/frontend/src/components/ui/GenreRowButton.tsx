import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { animateSlideUp } from "@/lib/motion/entrances";
import { cn } from "@/lib/utils";

/**
 * Per-index stagger step of the row entrance in seconds (was the CSS
 * `animation-delay: index * 60ms` on the `animate-slide-up` class).
 */
const ROW_ENTRANCE_STAGGER_SECONDS = 0.06;

/**
 * Upper bound for the staggered entrance delay in seconds (was the CSS
 * `Math.min(..., 600)` ms cap), so long result lists do not trickle in
 * forever.
 */
const ROW_ENTRANCE_DELAY_CAP_SECONDS = 0.6;

/**
 * An animated row button for genre-search result items. Wraps EmbossedButton
 * with the shared staggered slide-up entrance (GSAP port of the removed
 * `animate-slide-up` class): each row delays by its index within its column,
 * capped, exactly like the previous per-row `animation-delay`.
 *
 * The entrance runs once on mount (rows remount via their result `key` when
 * a new search lands, replaying the entrance like the CSS animation did).
 */
export function GenreRowButton({
  index,
  onClick,
  ariaLabel,
  children,
  disabled = false,
}: {
  index: number;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!rowRef.current) return;
    animateSlideUp(rowRef.current, {
      delaySeconds: Math.min(index * ROW_ENTRANCE_STAGGER_SECONDS, ROW_ENTRANCE_DELAY_CAP_SECONDS),
    });
  }, []);

  return (
    <div ref={rowRef}>
      <EmbossedButton
        as="button"
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn("w-full flex items-center gap-3 px-2 py-2 text-left", disabled && "cursor-default")}
        aria-label={ariaLabel}
      >
        {children}
      </EmbossedButton>
    </div>
  );
}
