import { type ReactNode, type Ref, useCallback } from "react";
import { useGroupedCorners } from "@/components/cards/useGroupedCorners";
import { cn } from "@/lib/utils";

/** Props for {@link GroupedCornerList}. */
interface GroupedCornerListProps {
  /** The row children, stacked with the `--mc-gap-list` gap. */
  children: ReactNode;
  /**
   * CSS selector for the grouped buttons. Defaults to the hook default
   * (`:scope > *`); the discovery lists pass `:scope > * > button`.
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
  /**
   * Optional ref to the list element, MERGED with the internal grouped-corners
   * ref. `DisambiguationPanel` passes its FLIP `listRef` here so the same node
   * gets grouped corners AND stays measurable by the FLIP choreography.
   */
  ref?: Ref<HTMLDivElement | null>;
  /** Optional extra classes merged after the base gap-list class. */
  className?: string;
}

/**
 * The grouped-corner list container shared by the artist-panel sections, the
 * genre-search columns and the disambiguation candidate list. Stacks its rows
 * with the `--mc-gap-list` gap and promotes the outer corners of the group via
 * {@link useGroupedCorners} so the rows read as one rounded block inscribed in
 * the surrounding recessed well.
 *
 * Exposes the full {@link useGroupedCorners} option surface as pass-through
 * props. A forwarded `ref` is merged with the internal hook ref (via a single
 * callback ref that writes both), so a consumer can attach its own measuring ref
 * to the very same node — `DisambiguationPanel` relies on this to keep its
 * GSAP-FLIP list node both grouped-cornered and measurable.
 */
export function GroupedCornerList({
  children,
  itemSelector,
  frameSelector,
  frameInset,
  promoteTop,
  ref,
  className,
}: GroupedCornerListProps) {
  const groupedListRef = useGroupedCorners<HTMLDivElement>({ itemSelector, frameSelector, frameInset, promoteTop });

  // Write the node to both the internal grouped-corners ref and the forwarded
  // ref so the consumer can measure the exact same element.
  const setEl = useCallback(
    (el: HTMLDivElement | null) => {
      groupedListRef.current = el;
      if (typeof ref === "function") {
        ref(el);
        return;
      }
      if (ref) ref.current = el;
    },
    [groupedListRef, ref],
  );

  return (
    <div ref={setEl} className={cn("flex flex-col gap-[var(--mc-gap-list,0.125rem)]", className)}>
      {children}
    </div>
  );
}
