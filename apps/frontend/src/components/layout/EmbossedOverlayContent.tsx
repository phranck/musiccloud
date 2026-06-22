import type { PublicContentPage } from "@musiccloud/shared";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { MD_EMBOSSED } from "@/components/layout/overlayContentProseClassMaps";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { EmbossedCloseButton } from "@/components/ui/EmbossedCloseButton";
import { useSegmented } from "@/hooks/useSegmented";
import { cn } from "@/lib/utils";

const OVERLAY_CONTENT_SCROLL = "h-full overflow-y-auto py-4";
const OVERLAY_DEFAULT_CONTENT_X = "px-4";
const OVERLAY_SEGMENTED_CONTENT_X = "px-3";

interface EmbossedOverlayContentProps {
  /** The content page to render inside the embossed overlay. */
  page: PublicContentPage;
  /** Closes the overlay. */
  onClose: () => void;
  /** When true, the frame is non-draggable (fullscreen mobile) so the header
   * drops its drag-handle affordances. */
  frameInteractionsDisabled?: boolean;
}

/**
 * Embossed (raised neumorphic) overlay content surface. Renders the page title
 * via the embossed card header, an optional segmented-control tab strip, and a
 * scrollable markdown body. When the page opts into `contentCardStyle:
 * 'recessed'` the body is wrapped in a `RecessedCard` (which owns its own
 * padding, so the scroll padding moves onto an inner div); otherwise the scroll
 * div renders directly. Segment selection, title cascade, and deep-link hash
 * sync are driven by {@link useSegmented}.
 */
export function EmbossedOverlayContent({
  page,
  onClose,
  frameInteractionsDisabled = false,
}: EmbossedOverlayContentProps) {
  const segmented = useSegmented(page, { syncHash: true });

  return (
    <EmbossedCard className={cn("mc-glass-card-overlay flex flex-col h-full")}>
      <EmbossedCard.Header
        className={cn(
          "p-2",
          frameInteractionsDisabled ? "cursor-default" : "overlay-drag-handle cursor-grab active:cursor-grabbing",
        )}
      >
        {segmented.resolvedShowTitle && (
          <EmbossedCard.Header.Title align={page.titleAlignment}>{segmented.resolvedTitle}</EmbossedCard.Header.Title>
        )}
        <EmbossedCard.Header.AddOn align="trailing">
          <EmbossedCloseButton onClick={onClose} />
        </EmbossedCard.Header.AddOn>
      </EmbossedCard.Header>
      {segmented.isSegmented && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="flex-1 min-h-0 overflow-hidden pt-3">
        {page.contentCardStyle === "recessed" ? (
          <RecessedCard className="h-full" padding="0">
            <div
              className={cn(
                OVERLAY_CONTENT_SCROLL,
                segmented.isSegmented ? OVERLAY_SEGMENTED_CONTENT_X : OVERLAY_DEFAULT_CONTENT_X,
              )}
            >
              <MarkdownHtml
                key={`seg-${segmented.activeIndex}`}
                html={segmented.resolvedHtml}
                className={MD_EMBOSSED}
              />
            </div>
          </RecessedCard>
        ) : (
          <div
            className={cn(
              OVERLAY_CONTENT_SCROLL,
              segmented.isSegmented ? OVERLAY_SEGMENTED_CONTENT_X : OVERLAY_DEFAULT_CONTENT_X,
            )}
          >
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={segmented.resolvedHtml} className={MD_EMBOSSED} />
          </div>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
