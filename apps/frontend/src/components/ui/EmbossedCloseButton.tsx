import { XIcon } from "@phosphor-icons/react";

import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

interface EmbossedCloseButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Round close button: an inner `EmbossedButton` circled by a 2px-padding
 * round `RecessedCard`. Used as the dismiss affordance in overlay-mode
 * content pages and anywhere a neumorphic close control is needed.
 */
export function EmbossedCloseButton({ onClick, ariaLabel = "Close", className }: EmbossedCloseButtonProps) {
  return (
    <RecessedCard padding="3px" radius="19px" className={cn("inline-flex", className)}>
      <EmbossedButton
        as="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={{ "--neu-radius-base": "16px" } as React.CSSProperties}
        className="rounded-full w-8 h-8 p-0 flex items-center justify-center text-text-secondary hover:text-text-primary"
      >
        <XIcon size={14} weight="bold" />
      </EmbossedButton>
    </RecessedCard>
  );
}
