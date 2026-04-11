import { compareByDisplayOrder } from "@musiccloud/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbedCardIsland } from "@/components/embed/EmbedCardIsland";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useT } from "@/i18n/context";
import type { PlatformLink } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

type EmbedSize = "small" | "regular" | "large";

interface EmbedModalProps {
  open: boolean;
  onClose: () => void;
  shortUrl: string;
  title: string;
  artist: string;
  artworkUrl: string;
  metaLine?: string;
  album?: string;
  isAlbum?: boolean;
  platforms: PlatformLink[];
}

function extractShortId(shortUrl: string): string {
  try {
    return new URL(shortUrl).pathname.replace(/^\//, "");
  } catch {
    return shortUrl;
  }
}

function buildEmbedCode(shortUrl: string, size: EmbedSize): string {
  const shortId = extractShortId(shortUrl);
  const dims = {
    small: { w: 400, h: 80, r: 14 },
    regular: { w: 400, h: 300, r: 12 },
    large: { w: 400, h: 480, r: 12 },
  };
  const d = dims[size];
  return `<iframe src="https://musiccloud.io/embed/${shortId}?size=${size}" width="${d.w}" height="${d.h}" frameborder="0" allow="encrypted-media" style="border-radius:${d.r}px"></iframe>`;
}

export function EmbedModal({
  open,
  onClose,
  shortUrl,
  title,
  artist,
  artworkUrl,
  metaLine,
  album,
  isAlbum,
  platforms,
}: EmbedModalProps) {
  const t = useT();
  const [size, setSize] = useState<EmbedSize>("small");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleCopy = useCallback(async () => {
    const code = buildEmbedCode(shortUrl, size);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 2000);
  }, [shortUrl, size]);

  const sortedPlatforms = [...platforms].sort((a, b) => compareByDisplayOrder(a.platform, b.platform));

  const sizes: { key: EmbedSize; label: string }[] = [
    { key: "small", label: t("embed.small") },
    { key: "regular", label: t("embed.regular") },
    { key: "large", label: t("embed.large") },
  ];

  if (!mounted) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-6",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className={cn(
          "absolute inset-0 transition-all duration-300 cursor-default",
          open ? "bg-black/60 backdrop-blur-lg" : "bg-black/0 backdrop-blur-none",
        )}
        onClick={onClose}
      >
        {/* backdrop click target */}
      </button>

      {/* Modal */}
      <EmbossedCard
        className={cn(
          "relative rounded-3xl p-0 bg-surface-elevated/95",
          "max-w-[520px] w-full max-h-[90dvh] overflow-y-auto",
          "transition-all duration-300",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">
            {isAlbum ? t("embed.titleAlbum") : t("embed.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-text-secondary hover:bg-white/[0.12] hover:text-text-primary transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Size Tabs */}
        <SegmentedControl className="mx-6 mb-4" segments={sizes} value={size} onChange={setSize} />

        {/* Preview Area */}
        <div className="px-6 pb-4">
          <EmbedPreviewArea
            size={size}
            title={title}
            artist={artist}
            artworkUrl={artworkUrl}
            shortUrl={shortUrl}
            metaLine={metaLine}
            album={album}
            platforms={sortedPlatforms}
          />
        </div>

        {/* Code Section */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between mb-2 px-(--spacing-card-inset)">
            <p className="text-xs uppercase tracking-widest text-text-secondary">{t("embed.code")}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.08] text-text-secondary text-xs font-medium hover:bg-white/[0.12] hover:text-text-primary transition-all duration-150"
            >
              {copyState === "idle" ? (
                <svg className="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
                  <path
                    opacity="0.2"
                    d="M184,72V216a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8H176A8,8,0,0,1,184,72Z"
                  />
                  <path d="M216,32H88a8,8,0,0,0-8,8V80H48a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H56V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                </svg>
              )}
              {copyState === "idle" ? t("embed.copy") : t("embed.copied")}
            </button>
          </div>
          <RecessedCard className="rounded-xl font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-all">
            {buildEmbedCode(shortUrl, size)}
          </RecessedCard>
        </div>
      </EmbossedCard>
    </div>,
    document.body,
  );
}

// ── Animated Preview Area ─────────────────────────────────────────────────────

function EmbedPreviewArea({
  size,
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  album,
  platforms,
}: {
  size: EmbedSize;
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  album?: string;
  platforms: PlatformLink[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: must re-measure after size change
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!contentRef.current) return;
      const activeChild = contentRef.current.querySelector("[data-active='true']") as HTMLElement | null;
      if (activeChild) {
        setHeight(activeChild.offsetHeight);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [size]);

  // padding-top + padding-bottom of the RecessedCard (p-6 = 24px each)
  const paddingY = 48;
  const sizes: EmbedSize[] = ["small", "regular", "large"];

  return (
    <RecessedCard
      className="rounded-xl p-6 flex justify-center items-start transition-[height] duration-300 ease-out overflow-hidden"
      style={{ height: height !== undefined ? height + paddingY : undefined }}
    >
      <div ref={contentRef} className="relative w-full flex justify-center">
        {sizes.map((s) => (
          <div
            key={s}
            data-active={size === s}
            className={cn(
              "transition-all duration-250",
              size === s ? "opacity-100 scale-100 relative" : "opacity-0 scale-95 absolute top-0 pointer-events-none",
            )}
          >
            <EmbedCardIsland
              size={s}
              title={title}
              artist={artist}
              artworkUrl={artworkUrl}
              shortUrl={shortUrl}
              metaLine={metaLine}
              album={album}
              platforms={platforms}
            />
          </div>
        ))}
      </div>
    </RecessedCard>
  );
}
