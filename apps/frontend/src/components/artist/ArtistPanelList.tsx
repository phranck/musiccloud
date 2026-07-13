import { Children, type CSSProperties, cloneElement, isValidElement, type ReactNode } from "react";
import { singleColumnGroupedCornerStyle } from "@/components/cards/singleColumnGroupedCornerStyle";

/** Props for {@link ArtistPanelList}. */
interface ArtistPanelListProps {
  /** The artist-panel row children. */
  children: ReactNode;
}

/**
 * Single-column event list inside an artist-panel well. Its first and last row
 * receive their outer corners declaratively at render time; no post-paint
 * layout measurement can leave the lower edge with stale radii.
 */
export function ArtistPanelList({ children }: ArtistPanelListProps) {
  const rows = Children.toArray(children);

  return (
    <div className="flex flex-col gap-[var(--mc-gap-list,0.125rem)]">
      {rows.map((row, index) => {
        if (!isValidElement<{ style?: CSSProperties }>(row)) return row;

        return cloneElement(row, {
          style: { ...row.props.style, ...singleColumnGroupedCornerStyle(index, rows.length) },
        });
      })}
    </div>
  );
}
