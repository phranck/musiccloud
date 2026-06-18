import type { ReactNode } from "react";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";

/** Props for {@link ArtistPanelList}. */
interface ArtistPanelListProps {
  /** The artist-panel row children. */
  children: ReactNode;
  /**
   * Selector for a per-row left-hugging frame (the artwork) whose left corners
   * should follow the row's grouped corners concentrically. Omit for text-only
   * lists (events have no artwork).
   */
  frameSelector?: string;
  /** Inset in px between the row edge and that frame. */
  frameInset?: number;
}

/**
 * The list container shared by all three artist-panel sections. Stacks its rows
 * with the `--mc-gap-list` gap and promotes the outer corners of the group via
 * {@link useGroupedCorners} so the rows read as one rounded block inscribed in
 * the surrounding recessed well.
 */
export function ArtistPanelList({ children, frameSelector, frameInset }: ArtistPanelListProps) {
  const listRef = useGroupedCorners<HTMLDivElement>({ frameSelector, frameInset });
  return (
    <div ref={listRef} className="flex flex-col gap-[var(--mc-gap-list,0.125rem)]">
      {children}
    </div>
  );
}
