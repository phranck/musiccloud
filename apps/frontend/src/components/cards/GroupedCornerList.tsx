import type { ReactNode } from "react";
import { groupedListClassName } from "@/components/cards/cardGeometry";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { cn } from "@/lib/utils";

/** Props for {@link GroupedCornerList}. */
interface GroupedCornerListProps {
  /** The row children, stacked with the `--mc-gap-list` gap. */
  children: ReactNode;
  /**
   * CSS selector for the grouped buttons. Defaults to the hook default
   * (`:scope > *`); the genre columns pass `:scope > * > button`.
   */
  itemSelector?: string;
  /**
   * Selector for a per-row left-hugging frame (the artwork) whose left corners
   * should follow the row's grouped corners concentrically. Omit for text-only
   * lists (events have no artwork).
   */
  frameSelector?: string;
  /** Inset in px between the row edge and that frame. */
  frameInset?: number;
  /**
   * Whether the group's top corners may be promoted. Pass `false` when a header
   * sits above the rows inside the same well (genre columns). Defaults to `true`.
   */
  promoteTop?: boolean;
  /** Optional extra classes merged after the base gap-list class. */
  className?: string;
}

/**
 * The grouped-corner list container of the genre-search columns. Stacks its
 * rows with the `--mc-gap-list` gap and promotes the outer corners of the group
 * via {@link useGroupedCorners} so the rows read as one rounded block inscribed
 * in the surrounding recessed well.
 */
export function GroupedCornerList({
  children,
  itemSelector,
  frameSelector,
  frameInset,
  promoteTop,
  className,
}: GroupedCornerListProps) {
  const groupedListRef = useGroupedCorners<HTMLDivElement>({ itemSelector, frameSelector, frameInset, promoteTop });

  return (
    <div ref={groupedListRef} className={cn(groupedListClassName, className)}>
      {children}
    </div>
  );
}
