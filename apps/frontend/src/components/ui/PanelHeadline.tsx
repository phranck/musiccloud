import type { ReactNode } from "react";

/** Props for {@link PanelHeadline}. */
interface PanelHeadlineProps {
  /**
   * The headline text. Typed as `ReactNode` (not a plain string) so a caller
   * can cross-fade between two title nodes — `DisambiguationPanel` wraps each
   * title/subtitle pair in its own `FadeInOnMount` to swap them.
   */
  title: ReactNode;
  /** The supporting subtitle line, rendered beneath the title. */
  subtitle: ReactNode;
}

/**
 * The dumb title + subtitle block shared by the discovery panels
 * (`DisambiguationPanel`, `GenreSearchResults`, `GenreBrowseGrid`). Renders
 * exactly the inner `<h2>` + `<p>` as a fragment — no wrapping element — so the
 * DOM stays byte-identical to the four inline copies it replaces. The
 * surrounding `EmbossedCard.Header` chrome (`text-center mb-4`, optional
 * `flex-shrink-0`) and any cross-fade wrapper stay at the call site.
 *
 * Purely presentational — the title and subtitle are supplied as `ReactNode`
 * so the caller controls their content and any per-node animation.
 */
export function PanelHeadline({ title, subtitle }: PanelHeadlineProps) {
  return (
    <>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary mt-1">{subtitle}</p>
    </>
  );
}
