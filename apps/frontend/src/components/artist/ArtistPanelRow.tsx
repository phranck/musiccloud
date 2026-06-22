import type { ReactNode } from "react";
import { ROW_CHROME } from "@/components/artist/artistPanelRowChrome";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

/**
 * Props for {@link ArtistPanelRow}. Mirrors {@link EmbossedButton}'s polymorphic
 * API: an anchor by default, or a `<button>` when `as="button"` is passed — so a
 * row can be a ticket link or an in-place resolve button without two components.
 *
 * The row's content is supplied as `children` (a leading visual, an
 * `ArtistPanelRowText` column and an optional trailing element). Passing it as
 * children rather than slot props keeps the JSX out of the prop boundary, which
 * is both idiomatic and avoids the `jsx-no-jsx-as-prop` perf rule.
 */
type ArtistPanelRowProps =
  | ({ children: ReactNode; className?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement> & { as?: "a" })
  | ({ children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement> & { as: "button" });

/**
 * One row inside an artist-panel list: an {@link EmbossedButton} carrying the
 * shared, token-driven row chrome. The single source of truth for row layout and
 * spacing across popular tracks, upcoming events and similar artists — the
 * content (artwork-or-not, text styling, duration-or-icon) is composed by the
 * caller as children.
 *
 * Lay the children out as: optional leading visual, an `ArtistPanelRowText`
 * column, then an optional trailing element. Pair the row with `ArtistPanelList`,
 * which owns the list's grouped corners and row gap.
 */
export function ArtistPanelRow(props: ArtistPanelRowProps) {
  const { children, className, ...interaction } = props;
  const mergedClassName = cn(ROW_CHROME, className);

  // Branch on the discriminant so the polymorphic union resolves to a concrete
  // EmbossedButton variant (same pattern EmbossedButton uses internally).
  if (interaction.as === "button") {
    return (
      <EmbossedButton {...interaction} className={mergedClassName}>
        {children}
      </EmbossedButton>
    );
  }
  return (
    <EmbossedButton {...interaction} className={mergedClassName}>
      {children}
    </EmbossedButton>
  );
}
