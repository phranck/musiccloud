import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { BrandName } from "@/components/ui/BrandName";
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

  const sortedPlatforms = [...platforms].sort((a, b) =>
    PLATFORM_CONFIG[a.platform].label.localeCompare(PLATFORM_CONFIG[b.platform].label),
  );

  const topPlatforms = sortedPlatforms.slice(0, 3);

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
      <div
        className={cn(
          "absolute inset-0 transition-all duration-300",
          open ? "bg-black/60 backdrop-blur-lg" : "bg-black/0 backdrop-blur-none",
        )}
        onClick={onClose}
      />

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
            topPlatforms={topPlatforms}
            sortedPlatforms={sortedPlatforms}
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
  topPlatforms,
  sortedPlatforms,
}: {
  size: EmbedSize;
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  album?: string;
  topPlatforms: PlatformLink[];
  sortedPlatforms: PlatformLink[];
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!contentRef.current) return;
    const activeChild = contentRef.current.querySelector("[data-active='true']") as HTMLElement | null;
    if (activeChild) {
      setHeight(activeChild.scrollHeight);
    }
  }, [size]);

  return (
    <RecessedCard
      className="rounded-xl p-6 flex justify-center items-start transition-[height] duration-300 ease-out"
      style={{ height: height !== undefined ? height + 48 : undefined }}
    >
      <div ref={contentRef} className="relative w-full flex justify-center">
        <div
          data-active={size === "small"}
          className={cn(
            "transition-all duration-250",
            size === "small"
              ? "opacity-100 scale-100 relative"
              : "opacity-0 scale-95 absolute top-0 pointer-events-none",
          )}
        >
          <EmbedSmall
            title={title}
            artist={artist}
            artworkUrl={artworkUrl}
            shortUrl={shortUrl}
            platforms={topPlatforms}
          />
        </div>
        <div
          data-active={size === "regular"}
          className={cn(
            "transition-all duration-250",
            size === "regular"
              ? "opacity-100 scale-100 relative"
              : "opacity-0 scale-95 absolute top-0 pointer-events-none",
          )}
        >
          <EmbedRegular
            title={title}
            artist={artist}
            artworkUrl={artworkUrl}
            shortUrl={shortUrl}
            metaLine={metaLine}
            platforms={sortedPlatforms}
          />
        </div>
        <div
          data-active={size === "large"}
          className={cn(
            "transition-all duration-250",
            size === "large"
              ? "opacity-100 scale-100 relative"
              : "opacity-0 scale-95 absolute top-0 pointer-events-none",
          )}
        >
          <EmbedLarge
            title={title}
            artist={artist}
            artworkUrl={artworkUrl}
            shortUrl={shortUrl}
            metaLine={metaLine}
            album={album}
            platforms={sortedPlatforms}
          />
        </div>
      </div>
    </RecessedCard>
  );
}

// ── Embed Card Variants ──────────────────────────────────────────────────────

function EmbedSmall({
  title,
  artist,
  artworkUrl,
  shortUrl,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  platforms: PlatformLink[];
}) {
  return (
    <div className="w-[400px] h-[80px] flex items-center gap-3 p-[10px] bg-surface-elevated border border-white/[0.08] rounded-[14px] shadow-lg">
      <a href={shortUrl} target="_blank" rel="noopener noreferrer">
        <img className="w-[60px] h-[60px] rounded-lg object-cover flex-shrink-0" src={artworkUrl} alt={title} />
      </a>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-text-primary truncate"
        >
          {title}
        </a>
        <span className="text-xs text-text-secondary truncate">{artist}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className="flex gap-1">
            {platforms.map((p) => (
              <a key={p.platform} href={p.url} target="_blank" rel="noopener noreferrer">
                <PlatformIcon platform={p.platform} className="w-[22px] h-[22px]" colored />
              </a>
            ))}
          </div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[10px] text-text-muted hover:text-text-secondary no-underline"
          >
            <BrandName />
          </a>
        </div>
      </div>
    </div>
  );
}

function EmbedRegular({
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  platforms: PlatformLink[];
}) {
  return (
    <div className="w-[400px] bg-surface-elevated border border-white/[0.08] rounded-xl shadow-lg overflow-hidden">
      <div className="w-full h-[180px] overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="w-full h-full object-cover" src={artworkUrl} alt={title} />
        </a>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-base font-semibold text-text-primary truncate block"
          >
            {title}
          </a>
          <p className="text-[13px] text-text-secondary">{artist}</p>
          {metaLine && <p className="text-xs text-text-muted font-mono">{metaLine}</p>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {platforms.map((p) => (
            <a
              key={p.platform}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:scale-110 transition-transform"
            >
              <PlatformIcon platform={p.platform} className="w-8 h-8" colored />
            </a>
          ))}
        </div>
        <div className="flex justify-end pt-1.5 border-t border-white/[0.06] mt-1">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-muted hover:text-text-secondary no-underline inline-flex items-baseline gap-1"
          >
            powered by <BrandName />
          </a>
        </div>
      </div>
    </div>
  );
}

function EmbedLarge({
  title,
  artist,
  artworkUrl,
  shortUrl,
  metaLine,
  album,
  platforms,
}: {
  title: string;
  artist: string;
  artworkUrl: string;
  shortUrl: string;
  metaLine?: string;
  album?: string;
  platforms: PlatformLink[];
}) {
  return (
    <div className="w-[400px] bg-surface-elevated border border-white/[0.08] rounded-xl shadow-lg overflow-hidden">
      <div className="w-full h-[200px] overflow-hidden">
        <a href={shortUrl} target="_blank" rel="noopener noreferrer">
          <img className="w-full h-full object-cover" src={artworkUrl} alt={title} />
        </a>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[17px] font-semibold text-text-primary block"
          >
            {title}
          </a>
          <p className="text-sm text-text-secondary">{artist}</p>
          {album && <p className="text-xs text-text-muted italic">{album}</p>}
          {metaLine && <p className="text-xs text-text-muted font-mono">{metaLine}</p>}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {platforms.map((p) => (
            <a
              key={p.platform}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 py-2 px-3 rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.12] transition-colors text-xs font-medium text-text-primary no-underline"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              <PlatformIcon platform={p.platform} className="w-6 h-6 flex-shrink-0" colored />
              {PLATFORM_CONFIG[p.platform].label}
              <span className="ml-auto text-text-muted text-[11px]">&rsaquo;</span>
            </a>
          ))}
        </div>
        <div className="flex justify-end pt-2 border-t border-white/[0.06] mt-1">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-muted hover:text-text-secondary no-underline inline-flex items-baseline gap-1"
          >
            powered by <BrandName />
          </a>
        </div>
      </div>
    </div>
  );
}
