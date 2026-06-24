import type { ReactNode, Ref } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
import { PanelHeadline } from "@/components/ui/PanelHeadline";
import { cn } from "@/lib/utils";

/** Props for {@link GenrePanelShell}. */
interface GenrePanelShellProps {
  /** The headline text (a `ReactNode` so a built natural-language node can be passed). */
  title: ReactNode;
  /** The supporting subtitle line beneath the title. */
  subtitle: ReactNode;
  /**
   * Outer width class applied to the fade wrapper. The browse grid passes a
   * fixed `md:max-w-5xl`; the search results pass a column-count-derived class.
   */
  maxWidthClass?: string;
  /** Forwarded to the fade wrapper so a consumer can focus/measure the panel. */
  ref?: Ref<HTMLDivElement>;
  /**
   * Optional leading add-on rendered in the card's `EmbossedCard.AddOn`
   * slot (e.g. the back-to-browse button). Supplied as a node (the consumer
   * computes it into a variable so it is not an inline JSX prop).
   */
  leadingAddOn?: ReactNode;
  /**
   * Optional footer content (warnings list + cancel). Rendered in the card's
   * footer slot; the consumer computes it into a variable.
   */
  footer?: ReactNode;
  /**
   * Class for the `EmbossedCard.Body`. Defaults to `flex-1 min-h-0`. The browse
   * grid adds `flex flex-col` so its single recessed well fills the body.
   */
  bodyClassName?: string;
  /** The panel body content (the grid / column layout, per consumer). */
  children: ReactNode;
}

/**
 * The shared chrome of the genre discovery panels (`GenreBrowseGrid`,
 * `GenreSearchResults`): a {@link FadeInOnMount} wrapper around an
 * {@link EmbossedCard} that is a flex column capped at `100vh − 16rem`, with the
 * shared {@link PanelHeadline}, an optional leading add-on, an optional footer,
 * and a scroll-bounded body.
 *
 * The `max-h-[calc(100vh-16rem)]` cap reserves vertical space for the stack that
 * sits above and below this card when it is visible:
 *
 *   PageHeader       ~ 2.5rem
 *   LogoView compact ~ 3.5rem  (w-56 + mb-6)
 *   HeroInput compact~ 3.75rem
 *   mt-8 gap above   ~ 2rem
 *   mb-8 gap below   ~ 2rem
 *                    ≈ 13.75rem — rounded up to 16rem for safety.
 *
 * Combined with `flex flex-col` on the card and `min-h-0 overflow-y-auto` on the
 * body's inner column(s), this keeps the card inside the viewport and lets
 * overflow scroll *within* the body instead of scrolling the page.
 *
 * `DisambiguationPanel` deliberately does NOT use this shell: its narrower
 * `sm:max-w-[480px]` plain card has no `max-h` and runs its own FLIP layout.
 */
export function GenrePanelShell({
  title,
  subtitle,
  maxWidthClass,
  ref,
  leadingAddOn,
  footer,
  bodyClassName,
  children,
}: GenrePanelShellProps) {
  return (
    <FadeInOnMount
      ref={ref}
      tabIndex={-1}
      className={cn("w-full max-w-full mx-auto mt-8 mb-8 focus:outline-none", maxWidthClass)}
    >
      <EmbossedCard className="flex flex-col max-h-[calc(100vh-16rem)]">
        {leadingAddOn && <EmbossedCard.AddOn align="leading">{leadingAddOn}</EmbossedCard.AddOn>}
        <EmbossedCard.Header className="text-center mb-4 flex-shrink-0">
          <PanelHeadline title={title} subtitle={subtitle} />
        </EmbossedCard.Header>
        <EmbossedCard.Body className={cn("flex-1 min-h-0", bodyClassName)}>{children}</EmbossedCard.Body>
        {footer && <EmbossedCard.Footer>{footer}</EmbossedCard.Footer>}
      </EmbossedCard>
    </FadeInOnMount>
  );
}
