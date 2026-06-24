import type { ReactNode } from "react";
import { GroupedCornerList } from "@/components/cards/GroupedCornerList";

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
 * The list container shared by all three artist-panel sections. A thin
 * default-options alias over {@link GroupedCornerList}: it forwards only the
 * artwork-frame options (the three artist consumers pass nothing else) and keeps
 * the hook's default `itemSelector`/`promoteTop`.
 */
export function ArtistPanelList({ children, frameSelector, frameInset }: ArtistPanelListProps) {
  return (
    <GroupedCornerList frameSelector={frameSelector} frameInset={frameInset}>
      {children}
    </GroupedCornerList>
  );
}
