import type { PublicContentPage } from "@musiccloud/shared";
import { XCircleIcon } from "@phosphor-icons/react";
import parse, { domToReact, type Element, type HTMLReactParserOptions } from "html-react-parser";
import { useMemo, useState } from "react";

import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { TranslucentCard } from "@/components/cards/TranslucentCard";
import { EmbossedCloseButton } from "@/components/ui/EmbossedCloseButton";
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
  "[&_a]:text-[var(--color-accent)] [&_a]:underline",
  "[&_hr]:border-white/10 [&_hr]:my-4",
  "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/30 [&_pre]:font-mono [&_pre]:text-sm",
  "[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/15 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
  "[&_.mc-badge]:inline-block [&_.mc-badge]:px-1.5 [&_.mc-badge]:py-0.5 [&_.mc-badge]:rounded [&_.mc-badge]:text-xs [&_.mc-badge]:font-semibold [&_.mc-badge]:uppercase [&_.mc-badge]:tracking-wider [&_.mc-badge]:font-mono [&_.mc-badge]:ml-1 [&_.mc-badge]:align-middle",
  "[&_.mc-badge-req]:bg-error/20 [&_.mc-badge-req]:text-error",
  "[&_.mc-badge-opt]:bg-white/15 [&_.mc-badge-opt]:text-white/70",
  "[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono [&_.mc-kbd]:bg-white/15 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/20 [&_.mc-kbd]:text-white/80 [&_.mc-kbd]:align-middle",
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
  "[&_a]:text-[var(--color-accent)] [&_a]:underline",
  "[&_hr]:border-black/10 [&_hr]:my-4",
  "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/20 [&_pre]:font-mono [&_pre]:text-sm",
  "[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/8 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
  "[&_.mc-badge]:inline-block [&_.mc-badge]:px-1.5 [&_.mc-badge]:py-0.5 [&_.mc-badge]:rounded [&_.mc-badge]:text-xs [&_.mc-badge]:font-semibold [&_.mc-badge]:uppercase [&_.mc-badge]:tracking-wider [&_.mc-badge]:font-mono [&_.mc-badge]:ml-1 [&_.mc-badge]:align-middle",
  "[&_.mc-badge-req]:bg-error/15 [&_.mc-badge-req]:text-error",
  "[&_.mc-badge-opt]:bg-text-muted/20 [&_.mc-badge-opt]:text-text-muted",
  "[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono [&_.mc-kbd]:bg-white/8 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/12 [&_.mc-kbd]:text-text-secondary [&_.mc-kbd]:align-middle",
  "[&>*:last-child]:mb-0",
].join(" ");

const parserOptions: HTMLReactParserOptions = {
  replace(domNode) {
    // Use duck-typing instead of instanceof — ESM/CJS dual-module issue causes
    // instanceof Element checks to fail depending on the import path.
    if (domNode.type !== "tag") return undefined;
    const el = domNode as Element;
    if (el.name !== "pre") return undefined;
    const cardStyle = el.attribs["data-card-style"];
    if (cardStyle !== "recessed" && cardStyle !== "embossed") return undefined;

    const padding = el.attribs["data-card-padding"] ?? "0.75rem";
    const radius = el.attribs["data-card-radius"] ?? "0.75rem";

    // Strip the marker and data-card-* attrs, add a sentinel so CSS in
    // MD_EMBOSSED can suppress the wrapped <pre>'s own padding/background
    // (the Card owns geometry now).
    const cleanAttribs = { ...el.attribs };
    delete cleanAttribs["data-card-style"];
    delete cleanAttribs["data-card-padding"];
    delete cleanAttribs["data-card-radius"];
    cleanAttribs["data-card-wrapped"] = "true";

    const inner = <pre {...cleanAttribs}>{domToReact(el.children as never, parserOptions)}</pre>;

    const cardProps = { padding, radius };
    return cardStyle === "recessed" ? (
      <RecessedCard {...cardProps}>{inner}</RecessedCard>
    ) : (
      <EmbossedCard {...cardProps}>{inner}</EmbossedCard>
    );
  },
};

// Single markdown injection site — every renderer below funnels through here.
// Input is server-sanitised by the backend markdown renderer before it ever
// leaves PublicContentPage.contentHtml. Block-level <pre data-card-style='...'>
// markers from the backend are converted to RecessedCard / EmbossedCard wraps.
export function MarkdownHtml({ html, className }: { html: string; className?: string }) {
  return <div className={className}>{parse(html, parserOptions)}</div>;
}

function useSegmented(page: PublicContentPage): {
  segments: { key: string; label: string }[];
  active: string;
  activeIndex: number;
  setActive: (next: string) => void;
  currentHtml: string;
  currentTitle: string;
  currentShowTitle: boolean;
} {
  // Key segments by their index so two segments pointing at the same
  // target slug keep distinct React keys (otherwise the segmented control
  // collapses them and active state can't be tracked per-segment).
  const segments = useMemo(() => page.segments.map((s, i) => ({ key: String(i), label: s.label })), [page.segments]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const current = page.segments[activeIndex] ?? page.segments[0];
  return {
    segments,
    active: String(activeIndex),
    activeIndex,
    setActive: (next) => {
      const idx = Number.parseInt(next, 10);
      if (!Number.isNaN(idx)) setActiveIndex(idx);
    },
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
  // Title cascade for segmented pages: owner's showTitle overrides the
  // target's — when set, the segmented page's own title is shown on every
  // tab. Otherwise the active target's title takes over (if it opts in).
  const title = isSegmented && !page.showTitle ? segmented.currentTitle : page.title;
  const showTitle = isSegmented ? page.showTitle || segmented.currentShowTitle : page.showTitle;

  return (
    <TranslucentCard className="h-full">
      <TranslucentCard.Header className="relative px-3 pb-3 overlay-drag-handle cursor-grab active:cursor-grabbing">
        {showTitle && (
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-white text-center truncate px-10">{title}</h2>
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
      {isSegmented && (
        <TranslucentCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <TranslucentCard.Body>
        <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_TRANSLUCENT} />
      </TranslucentCard.Body>
    </TranslucentCard>
  );
}

export function EmbossedOverlayContent({ page, onClose }: OverlayContentProps) {
  const segmented = useSegmented(page);
  const isSegmented = page.pageType === "segmented" && page.segments.length > 0;
  const html = isSegmented ? segmented.currentHtml : page.contentHtml;
  // See title-cascade note in TranslucentOverlayContent above.
  const title = isSegmented && !page.showTitle ? segmented.currentTitle : page.title;
  const showTitle = isSegmented ? page.showTitle || segmented.currentShowTitle : page.showTitle;

  return (
    <EmbossedCard className={cn("flex flex-col h-full")}>
      <EmbossedCard.Header className="px-2 py-2 overlay-drag-handle cursor-grab active:cursor-grabbing">
        {showTitle && <EmbossedCard.Header.Title align={page.titleAlignment}>{title}</EmbossedCard.Header.Title>}
        <EmbossedCard.Header.AddOn align="trailing">
          <EmbossedCloseButton onClick={onClose} />
        </EmbossedCard.Header.AddOn>
      </EmbossedCard.Header>
      {isSegmented && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="flex-1 min-h-0 overflow-hidden pt-3">
        {page.contentCardStyle === "recessed" ? (
          <RecessedCard className="h-full" padding="0">
            <div className="h-full overflow-y-auto px-4 py-4">
              <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
            </div>
          </RecessedCard>
        ) : (
          <div className="h-full overflow-y-auto px-4 py-4">
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
          </div>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}

export function SegmentedPageFullscreen({ page }: { page: PublicContentPage }) {
  const segmented = useSegmented(page);
  const hasSegments = page.segments.length > 0;
  const html = hasSegments ? segmented.currentHtml : page.contentHtml;
  // See title-cascade note in TranslucentOverlayContent above.
  const title = hasSegments && !page.showTitle ? segmented.currentTitle : page.title;
  const showTitle = hasSegments ? page.showTitle || segmented.currentShowTitle : page.showTitle;

  return (
    <EmbossedCard className="flex flex-col w-full">
      <EmbossedCard.Header className="flex items-center justify-center px-6 py-2">
        {showTitle && (
          <EmbossedCard.Header.Title align={page.titleAlignment} className="text-2xl">
            {title}
          </EmbossedCard.Header.Title>
        )}
      </EmbossedCard.Header>
      {hasSegments && (
        <EmbossedCard.SegmentedControl
          segments={segmented.segments}
          value={segmented.active}
          onChange={segmented.setActive}
        />
      )}
      <EmbossedCard.Body className="p-3">
        {page.contentCardStyle === "recessed" ? (
          <RecessedCard className="px-6 py-6">
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
          </RecessedCard>
        ) : (
          <div className="px-6 py-6">
            <MarkdownHtml key={`seg-${segmented.activeIndex}`} html={html} className={MD_EMBOSSED} />
          </div>
        )}
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
