import { RecessedCard } from "@/components/cards/RecessedCard";

/**
 * A labelled scrollable column used in the genre-search results grid.
 * Header is pinned, content scrolls when overflowing. The header drops a
 * subtle shadow onto the scroll content, but only while `scrollTop > 0`
 * so it fades in/out with actual scroll position.
 */
export function GenreColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RecessedCard className="flex flex-col min-h-0">
      <RecessedCard.Header className="mb-0 pt-1 pb-2">
        <RecessedCard.Header.Title className="text-xs tracking-wider text-text-muted font-semibold">
          {label}
        </RecessedCard.Header.Title>
      </RecessedCard.Header>
      <RecessedCard.Body scrollable className="flex flex-col gap-1.5 rounded-b-xl">
        {children}
      </RecessedCard.Body>
    </RecessedCard>
  );
}
