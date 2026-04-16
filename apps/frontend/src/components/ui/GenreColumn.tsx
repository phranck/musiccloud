import { RecessedCard } from "@/components/cards/RecessedCard";

/**
 * A labelled scrollable column used in the genre-search results grid.
 * Header is pinned, content scrolls when overflowing.
 */
export function GenreColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <RecessedCard className="p-2 flex flex-col min-h-0" radius="0.75rem">
      <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold px-2 pt-1 pb-2 flex-shrink-0">
        {label}
      </h3>
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">{children}</div>
    </RecessedCard>
  );
}
