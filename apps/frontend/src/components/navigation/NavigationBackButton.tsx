import { ArrowFatLeft } from "@phosphor-icons/react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

interface NavigationBackButtonProps {
  onClick: () => void;
  label: string;
  className?: string;
}

/**
 * Back navigation affordance: an EmbossedButton nested inside a RecessedCard
 * with a 2 px gap between them. The ArrowFatLeft (duotone) icon is fixed —
 * callers only supply the label.
 */
export function NavigationBackButton({ onClick, label, className }: NavigationBackButtonProps) {
  return (
    <RecessedCard radius="0.625rem" className={cn("inline-flex items-center p-0.5", className)}>
      <RecessedCard.Body>
        <EmbossedButton
          as="button"
          onClick={onClick}
          aria-label={label}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary"
        >
          <ArrowFatLeft size={16} weight="duotone" />
          {label}
        </EmbossedButton>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
