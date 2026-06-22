import type { PublicContentPage } from "@musiccloud/shared";
import { XCircleIcon } from "@phosphor-icons/react";
import { TranslucentCard } from "@/components/cards/TranslucentCard";
import { MD_TRANSLUCENT } from "@/components/layout/overlayContentProseClassMaps";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { useSegmented } from "@/hooks/useSegmented";
import { cn } from "@/lib/utils";

interface TranslucentOverlayContentProps {
  /** The content page to render inside the translucent overlay. */
  page: PublicContentPage;
  /** Closes the overlay. */
  onClose: () => void;
  /** When true, the frame is non-draggable (fullscreen mobile) so the header
   * drops its drag-handle affordances. */
  frameInteractionsDisabled?: boolean;
}

/**
 * Translucent (frosted glass) overlay content surface. Renders the page title,
 * an optional segmented-control tab strip, and the markdown body through the
 * single {@link MarkdownHtml} injection site styled with the translucent prose
 * class-map. Segment selection, title cascade, and deep-link hash sync are
 * driven by {@link useSegmented}.
 */
export function TranslucentOverlayContent({
  page,
  onClose,
  frameInteractionsDisabled = false,
}: TranslucentOverlayContentProps) {
  const segmented = useSegmented(page, { syncHash: true });

  return (
    <TranslucentCard className="h-full">
      <TranslucentCard.Header
        className={cn(
          "relative px-3 pb-3",
          frameInteractionsDisabled ? "cursor-default" : "overlay-drag-handle cursor-grab active:cursor-grabbing",
        )}
      >
        {segmented.resolvedShowTitle && (
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-white text-center truncate px-10">
            {segmented.resolvedTitle}
          </h2>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-1 right-1 p-1.5 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
        >
          <XCircleIcon size={24} weight="duotone" />
        </button>
      </TranslucentCard.Header>
      {segmented.isSegmented && (
        <TranslucentCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <TranslucentCard.Body className={segmented.isSegmented ? "px-4 sm:px-5" : undefined}>
        <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={segmented.resolvedHtml} className={MD_TRANSLUCENT} />
      </TranslucentCard.Body>
    </TranslucentCard>
  );
}
