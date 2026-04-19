import { compareByDisplayOrder } from "@musiccloud/shared";
import { CheckIcon, CopySimpleIcon, WarningIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbedCardIsland } from "@/components/embed/EmbedCardIsland";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { EmbossedCloseButton } from "@/components/ui/EmbossedCloseButton";
import { EmbossedSegmentedControl } from "@/components/ui/EmbossedSegmentedControl";
import { useIsClient } from "@/hooks/useIsClient";
import { useT } from "@/i18n/context";
import type { PlatformLink } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

// Horizontal inset for sibling elements sitting above a cascading
// RecessedCard (here: the "Embed Code" label + Copy button row above the
// <iframe> code card). Half the inner card's corner radius — derived live
// from the cascade vars so it tracks if the outer EmbossedCard's geometry
// ever changes.
const SIBLING_INSET_X = "calc((var(--emb-radius) - var(--emb-padding)) / 2)";

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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const mounted = useIsClient();
  const overlayRef = useRef<HTMLDivElement>(null);

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
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
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
          open ? "bg-black/40 backdrop-blur-sm" : "bg-black/0 backdrop-blur-none",
        )}
        onClick={onClose}
      >
        {/* backdrop click target */}
      </button>

      {/* Modal */}
      <EmbossedCard
        className={cn(
          "relative",
          "max-w-[520px] w-full max-h-[90dvh] overflow-y-auto",
          "transition-all duration-300",
          open ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
      >
        <EmbossedCard.Header className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" style={{ paddingLeft: SIBLING_INSET_X }}>
            {isAlbum ? t("embed.titleAlbum") : t("embed.title")}
          </h2>
          <EmbossedCloseButton onClick={onClose} />
        </EmbossedCard.Header>

        <EmbossedCard.Body>
          <EmbossedSegmentedControl className="mb-3" segments={sizes} value={size} onChange={setSize} />

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

          <div
            className="flex items-center justify-between mt-3 mb-2"
            style={{ paddingLeft: SIBLING_INSET_X, paddingRight: SIBLING_INSET_X }}
          >
            <p
              className="text-xs uppercase tracking-widest text-text-secondary font-bold"
              style={{ fontFamily: "var(--font-condensed)" }}
            >
              {t("embed.code")}
            </p>
            <RecessedCard padding="3px" radius="0.5rem" className="inline-flex">
              <RecessedCard.Body>
                <EmbossedButton
                  as="button"
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-text-secondary text-xs font-medium"
                >
                  {copyState === "idle" && <CopySimpleIcon size={16} weight="duotone" />}
                  {copyState === "copied" && <CheckIcon size={16} weight="duotone" />}
                  {copyState === "error" && <WarningIcon size={16} weight="duotone" />}
                  {copyState === "idle" && t("embed.copy")}
                  {copyState === "copied" && t("embed.copied")}
                  {copyState === "error" && t("embed.copyError")}
                </EmbossedButton>
              </RecessedCard.Body>
            </RecessedCard>
          </div>
          <RecessedCard className="font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-all">
            <RecessedCard.Body>{buildEmbedCode(shortUrl, size)}</RecessedCard.Body>
          </RecessedCard>
        </EmbossedCard.Body>
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

  // Preview RecessedCard: extra vertical breathing room (1.5 rem top+bottom)
  // because the card swaps three different preview sizes and the cascade's
  // default 0.375 rem looks cramped. Horizontal padding stays on the cascade
  // (`--emb-padding / 2`) to keep the inner card inscribed in the outer.
  // Read the actual paddingTop/Bottom off the DOM so the height animation
  // stays aligned if the outer card's geometry ever changes.
  const previewCardRef = useRef<HTMLDivElement>(null);
  const [paddingY, setPaddingY] = useState(48);
  useLayoutEffect(() => {
    if (!previewCardRef.current) return;
    const cs = getComputedStyle(previewCardRef.current);
    setPaddingY(parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
  }, []);
  const sizes: EmbedSize[] = ["small", "regular", "large"];

  return (
    <RecessedCard
      ref={previewCardRef}
      padding="1.5rem calc(var(--emb-padding, 2rem) / 2)"
      className="flex justify-center items-start transition-[height] duration-300 ease-out overflow-hidden"
      style={{ height: height !== undefined ? height + paddingY : undefined }}
    >
      <RecessedCard.Body className="contents">
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
      </RecessedCard.Body>
    </RecessedCard>
  );
}
