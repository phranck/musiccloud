import type { PublicContentPage } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { TranslucentCard } from "@/components/cards/TranslucentCard";
import { cn } from "@/lib/utils";

const MD_TRANSLUCENT = [
  "[&_h1]:text-white [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
  "[&_h2]:text-white/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
  "[&_h3]:text-white/80 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
  "[&_p]:text-white/60 [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3",
  "[&_ul]:text-white/60 [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
  "[&_ol]:text-white/60 [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
  "[&_li]:leading-relaxed",
  "[&_strong]:text-white/80 [&_strong]:font-medium",
  "[&_a]:text-[var(--color-accent,#a78bfa)] [&_a]:underline",
  "[&_hr]:border-white/10 [&_hr]:my-4",
  "[&>*:last-child]:mb-0",
].join(" ");

const MD_EMBOSSED = [
  "[&_h1]:text-text-primary [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
  "[&_h2]:text-text-primary [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
  "[&_h3]:text-text-primary [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
  "[&_p]:text-text-secondary [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3",
  "[&_ul]:text-text-secondary [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
  "[&_ol]:text-text-secondary [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
  "[&_li]:leading-relaxed",
  "[&_strong]:text-text-primary [&_strong]:font-medium",
  "[&_a]:text-[var(--color-primary)] [&_a]:underline",
  "[&_hr]:border-black/10 [&_hr]:my-4",
  "[&>*:last-child]:mb-0",
].join(" ");

// Single markdown injection site — every renderer below funnels through here.
// Input is server-sanitised by the backend markdown renderer before it ever
// leaves `PublicContentPage.contentHtml`.
function MarkdownHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

interface SegmentedState {
  activeTargetSlug: string;
}

function useSegmented(page: PublicContentPage): {
  segments: { key: string; label: string }[];
  active: string;
  setActive: (next: string) => void;
  currentHtml: string;
  currentTitle: string;
  currentShowTitle: boolean;
} {
  const segments = useMemo(() => page.segments.map((s) => ({ key: s.targetSlug, label: s.label })), [page.segments]);
  const [state, setState] = useState<SegmentedState>(() => ({
    activeTargetSlug: page.segments[0]?.targetSlug ?? "",
  }));
  const current = page.segments.find((s) => s.targetSlug === state.activeTargetSlug) ?? page.segments[0];
  return {
    segments,
    active: state.activeTargetSlug,
    setActive: (next) => setState({ activeTargetSlug: next }),
    currentHtml: current?.contentHtml ?? "",
    currentTitle: current?.title ?? page.title,
    currentShowTitle: current?.showTitle ?? page.showTitle,
  };
}

interface OverlayContentProps {
  page: PublicContentPage;
  onClose: () => void;
}

export function TranslucentOverlayContent({ page, onClose }: OverlayContentProps) {
  const segmented = useSegmented(page);
  const isSegmented = page.pageType === "segmented" && page.segments.length > 0;
  const html = isSegmented ? segmented.currentHtml : page.contentHtml;
  const title = isSegmented ? segmented.currentTitle : page.title;
  const showTitle = isSegmented ? segmented.currentShowTitle : page.showTitle;

  return (
    <TranslucentCard className="h-full">
      <TranslucentCard.Header className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {showTitle && <h2 className="text-xl font-semibold tracking-[-0.01em] text-white truncate">{title}</h2>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
        >
          <XIcon size={16} weight="duotone" />
        </button>
      </TranslucentCard.Header>
      {isSegmented && (
        <TranslucentCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <TranslucentCard.Body>
        <MarkdownHtml html={html} className={MD_TRANSLUCENT} />
      </TranslucentCard.Body>
    </TranslucentCard>
  );
}

export function EmbossedOverlayContent({ page, onClose }: OverlayContentProps) {
  const segmented = useSegmented(page);
  const isSegmented = page.pageType === "segmented" && page.segments.length > 0;
  const html = isSegmented ? segmented.currentHtml : page.contentHtml;
  const title = isSegmented ? segmented.currentTitle : page.title;
  const showTitle = isSegmented ? segmented.currentShowTitle : page.showTitle;

  return (
    <EmbossedCard className={cn("h-full flex flex-col")}>
      <EmbossedCard.AddOn align="trailing">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 text-text-secondary hover:text-text-primary transition-colors duration-150 rounded-lg focus:outline-none"
        >
          <XIcon size={16} weight="duotone" />
        </button>
      </EmbossedCard.AddOn>
      <EmbossedCard.Header className="px-4 pt-4">
        {showTitle && <h2 className="text-xl font-semibold tracking-[-0.01em] text-text-primary truncate">{title}</h2>}
      </EmbossedCard.Header>
      {isSegmented && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <MarkdownHtml html={html} className={MD_EMBOSSED} />
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}

export function SegmentedPageFullscreen({ page }: { page: PublicContentPage }) {
  const segmented = useSegmented(page);
  const hasSegments = page.segments.length > 0;
  const html = hasSegments ? segmented.currentHtml : page.contentHtml;
  const title = hasSegments ? segmented.currentTitle : page.title;
  const showTitle = hasSegments ? segmented.currentShowTitle : page.showTitle;

  return (
    <EmbossedCard className="flex flex-col w-full">
      <EmbossedCard.Header className="px-6 pt-6">
        {showTitle && <h2 className="text-2xl font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>}
      </EmbossedCard.Header>
      {hasSegments && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="px-6 py-6">
        <MarkdownHtml html={html} className={MD_EMBOSSED} />
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
