import { useState } from "react";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

/**
 * A labelled scrollable column used in the genre-search results grid.
 * Header is pinned, content scrolls when overflowing. The header drops a
 * subtle shadow onto the scroll content, but only while `scrollTop > 0`
 * so it fades in/out with actual scroll position.
 */
export function GenreColumn({ label, children }: { label: string; children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <RecessedCard className="flex flex-col min-h-0">
      <h3
        className={cn(
          "text-xs uppercase tracking-wider text-text-muted font-semibold px-2 pt-1 pb-2",
          "flex-shrink-0 relative z-10 transition-shadow duration-150",
          scrolled && "shadow-[0_4px_8px_-2px_rgba(0,0,0,0.45)]",
        )}
      >
        {label}
      </h3>
      <div
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto rounded-b-xl"
      >
        {children}
      </div>
    </RecessedCard>
  );
}
