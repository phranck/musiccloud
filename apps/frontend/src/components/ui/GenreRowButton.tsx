import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

/**
 * An animated row button for genre-search result items.
 * Wraps EmbossedButton with staggered slide-up animation.
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
  return (
    <div className="animate-slide-up" style={{ animationDelay: `${Math.min(index * 60, 600)}ms` }}>
      <EmbossedButton
        as="button"
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn("w-full flex items-center gap-3 px-2 py-2 text-left rounded-lg", disabled && "cursor-default")}
        aria-label={ariaLabel}
      >
        {children}
      </EmbossedButton>
    </div>
  );
}
