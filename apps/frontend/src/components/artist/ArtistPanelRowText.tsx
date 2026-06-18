import type { ReactNode } from "react";

/**
 * The flexible middle column of an artist-panel row: a min-width-0 column that
 * truncates/clips its lines and fills the space between the leading visual and
 * the trailing element. Wrap the row's text lines (`<p>`s) in this so the column
 * geometry stays consistent across all three artist-panel section types.
 */
export function ArtistPanelRowText({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 overflow-hidden text-left">{children}</div>;
}
