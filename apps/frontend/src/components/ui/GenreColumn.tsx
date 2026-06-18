import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { cn } from "@/lib/utils";

/**
 * A labelled scrollable column used in the genre-search results grid.
 * Header is pinned, content scrolls when overflowing. The header drops a
 * subtle shadow onto the scroll content, but only while `scrollTop > 0`
 * so it fades in/out with actual scroll position.
 *
 * The rows follow the grouped-corner rule (AGENTS.md) via {@link useGroupedCorners}.
 * `promoteTop` is false: the column header sits above the rows inside the same
 * well, so the first row's top corners stay at the ≤5px inner radius; only the
 * last row's bottom corners promote to meet the well's rounded bottom.
 */
export function GenreColumn({ label, children }: { label: string; children: React.ReactNode }) {
  const listRef = useGroupedCorners<HTMLDivElement>({
    itemSelector: ":scope > * > button",
    frameSelector: ".mc-row-art",
    frameInset: 4,
    promoteTop: false,
  });

  return (
    <RecessedCard className={cn("flex flex-col min-h-0", recessedControlInsetClassName)}>
      <RecessedCard.Header className="mb-0 pt-1 pb-2">
        <RecessedCard.Header.Title className="text-xs tracking-wider text-text-muted font-semibold">
          {label}
        </RecessedCard.Header.Title>
      </RecessedCard.Header>
      <RecessedCard.Body
        scrollable
        className="rounded-b-[max(4px,calc(var(--mc-recessed-radius-base)-var(--mc-recessed-padding)))]"
      >
        <div ref={listRef} className="flex flex-col gap-[var(--mc-gap-list,0.125rem)]">
          {children}
        </div>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
