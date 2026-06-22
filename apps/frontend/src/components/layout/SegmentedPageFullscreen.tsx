import type { PublicContentPage } from "@musiccloud/shared";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { MD_EMBOSSED } from "@/components/layout/overlayContentProseClassMaps";
import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { useSegmented } from "@/hooks/useSegmented";
import { cn } from "@/lib/utils";

const FULLSCREEN_CONTENT_X = "px-6";
const FULLSCREEN_SEGMENTED_CONTENT_X = "px-4 sm:px-5";

/**
 * Standalone fullscreen renderer for a (possibly segmented) content page, used
 * by the Astro share pages. Unlike the overlay surfaces it ignores `pageType`
 * and treats any page carrying segments as segmented (hence
 * `segmentGate.requirePageType: false`) and does not sync the URL hash. Renders
 * the title, an optional segmented-control tab strip, and the markdown body
 * styled with the embossed prose class-map.
 *
 * @param page - the content page to render fullscreen
 */
export function SegmentedPageFullscreen({ page }: { page: PublicContentPage }) {
  const segmented = useSegmented(page, { segmentGate: { requirePageType: false } });

  return (
    <EmbossedCard className="flex flex-col w-full">
      <EmbossedCard.Header className="flex items-center justify-center px-6 py-2">
        {segmented.resolvedShowTitle && (
          <EmbossedCard.Header.Title align={page.titleAlignment} className="text-2xl">
            {segmented.resolvedTitle}
          </EmbossedCard.Header.Title>
        )}
      </EmbossedCard.Header>
      {segmented.isSegmented && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="p-3">
        {page.contentCardStyle === "recessed" ? (
          <RecessedCard
            className={cn("py-6", segmented.isSegmented ? FULLSCREEN_SEGMENTED_CONTENT_X : FULLSCREEN_CONTENT_X)}
          >
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={segmented.resolvedHtml} className={MD_EMBOSSED} />
          </RecessedCard>
        ) : (
          <div className={cn("py-6", segmented.isSegmented ? FULLSCREEN_SEGMENTED_CONTENT_X : FULLSCREEN_CONTENT_X)}>
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={segmented.resolvedHtml} className={MD_EMBOSSED} />
          </div>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
