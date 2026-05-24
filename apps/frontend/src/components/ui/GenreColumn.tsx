import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

/**
 * A labelled scrollable column used in the genre-search results grid.
 * Header is pinned, content scrolls when overflowing. The header drops a
 * subtle shadow onto the scroll content, but only while `scrollTop > 0`
 * so it fades in/out with actual scroll position.
 */
export function GenreColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RecessedCard className={cn("flex flex-col min-h-0", recessedControlInsetClassName)}>
      <RecessedCard.Header className="mb-0 pt-1 pb-2">
        <RecessedCard.Header.Title className="text-xs tracking-wider text-text-muted font-semibold">
          {label}
        </RecessedCard.Header.Title>
      </RecessedCard.Header>
      <RecessedCard.Body
        scrollable
        className="flex flex-col gap-0.5 rounded-b-[max(4px,calc(var(--mc-recessed-radius-base)-var(--mc-recessed-padding)))]"
      >
        {children}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
