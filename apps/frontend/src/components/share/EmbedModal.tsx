import { clampViewportRect, compareByDisplayOrder, moveViewportRect, type ViewportRect } from "@musiccloud/shared";
import { CheckIcon, CopySimpleIcon, WarningIcon } from "@phosphor-icons/react";
import {
  type CSSProperties,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbedCardIsland } from "@/components/embed/EmbedCardIsland";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { EmbossedCloseButton } from "@/components/ui/EmbossedCloseButton";
import { EmbossedSegmentedControl } from "@/components/ui/EmbossedSegmentedControl";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { useIsClient } from "@/hooks/useIsClient";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { useT } from "@/i18n/context";
import type { PlatformLink } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";
import { embossedOverlayCardStyle } from "@/styles/neumorphic";

// Horizontal inset for sibling elements sitting above a cascading
// RecessedCard (here: the "Embed Code" label + Copy button row above the
// <iframe> code card). Half the inner card's corner radius — derived live
// from the cascade vars so it tracks if the outer EmbossedCard's geometry
// ever changes.
const SIBLING_INSET_X = "calc((var(--emb-radius) - var(--emb-padding)) / 2)";
const EMBED_MODAL_POSITION_KEY = "mc:embed-modal-position";
const EMBED_MODAL_VIEWPORT_MARGIN = 24;
const EMBED_MODAL_FALLBACK_WIDTH = 520;
const EMBED_MODAL_FALLBACK_HEIGHT = 520;

type EmbedSize = "small" | "regular" | "large";

interface EmbedModalPosition {
  x: number;
  y: number;
}

interface EmbedModalDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originRect: ViewportRect;
  currentPosition: EmbedModalPosition;
}

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

function modalSize(element: HTMLElement | null): { width: number; height: number } {
  return {
    width:
      element?.offsetWidth || Math.min(EMBED_MODAL_FALLBACK_WIDTH, window.innerWidth - EMBED_MODAL_VIEWPORT_MARGIN * 2),
    height:
      element?.offsetHeight ||
      Math.min(EMBED_MODAL_FALLBACK_HEIGHT, window.innerHeight - EMBED_MODAL_VIEWPORT_MARGIN * 2),
  };
}

function embedModalConstraints() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    minWidth: 1,
    minHeight: 1,
    margin: EMBED_MODAL_VIEWPORT_MARGIN,
  };
}

function embedModalRect(position: EmbedModalPosition, element: HTMLElement | null): ViewportRect {
  const { width, height } = modalSize(element);
  return { x: position.x, y: position.y, width, height };
}

function clampEmbedModalPosition(position: EmbedModalPosition, element: HTMLElement | null): EmbedModalPosition {
  const rect = clampViewportRect(embedModalRect(position, element), embedModalConstraints());
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
  };
}

function defaultEmbedModalPosition(element: HTMLElement | null): EmbedModalPosition {
  const { width, height } = modalSize(element);
  return clampEmbedModalPosition(
    {
      x: Math.round((window.innerWidth - width) / 2),
      y: Math.round((window.innerHeight - height) / 2),
    },
    element,
  );
}

function readEmbedModalPosition(): EmbedModalPosition | null {
  try {
    const raw = window.localStorage.getItem(EMBED_MODAL_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EmbedModalPosition> | null;
    if (!parsed || typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function saveEmbedModalPosition(position: EmbedModalPosition): void {
  try {
    window.localStorage.setItem(EMBED_MODAL_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Disabled or full storage should not break modal movement.
  }
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
  const modalFrameRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<EmbedModalDragState | null>(null);
  const [position, setPosition] = useState<EmbedModalPosition | null>(null);
  const positionRef = useRef<EmbedModalPosition | null>(null);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const syncModalPosition = useCallback(() => {
    const element = modalFrameRef.current;
    const storedPosition = readEmbedModalPosition();
    setPosition((currentPosition) =>
      clampEmbedModalPosition(currentPosition ?? storedPosition ?? defaultEmbedModalPosition(element), element),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    void size;
    syncModalPosition();
  }, [open, size, syncModalPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", syncModalPosition);
    return () => window.removeEventListener("resize", syncModalPosition);
  }, [open, syncModalPosition]);

  const beginDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".embed-modal-drag-handle")) return;
    if (target.closest("button, a, input, textarea, [role=tab]")) return;

    const element = modalFrameRef.current;
    const currentPosition = positionRef.current ?? defaultEmbedModalPosition(element);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originRect: embedModalRect(currentPosition, element),
      currentPosition,
    };
    event.currentTarget.style.transition = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const updateDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const nextRect = moveViewportRect(
      state.originRect,
      event.clientX - state.startX,
      event.clientY - state.startY,
      embedModalConstraints(),
    );
    const nextPosition = { x: Math.round(nextRect.x), y: Math.round(nextRect.y) };
    state.currentPosition = nextPosition;
    event.currentTarget.style.transform = `translate3d(${nextPosition.x - state.originRect.x}px, ${
      nextPosition.y - state.originRect.y
    }px, 0)`;
  }, []);

  const endDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
    event.currentTarget.style.left = `${state.currentPosition.x}px`;
    event.currentTarget.style.top = `${state.currentPosition.y}px`;
    event.currentTarget.style.transform = "";
    event.currentTarget.style.transition = "";
    positionRef.current = state.currentPosition;
    setPosition(state.currentPosition);
    saveEmbedModalPosition(state.currentPosition);
  }, []);

  useOverlayEscape({ enabled: open, onEscape: onClose });

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

  const sortedPlatforms = platforms.toSorted((a, b) => compareByDisplayOrder(a.platform, b.platform));

  const sizes: { key: EmbedSize; label: string }[] = [
    { key: "small", label: t("embed.small") },
    { key: "regular", label: t("embed.regular") },
    { key: "large", label: t("embed.large") },
  ];

  if (!mounted) return null;

  const modalFrameStyle = {
    left: `${position?.x ?? 0}px`,
    top: `${position?.y ?? 0}px`,
    visibility: position ? undefined : "hidden",
  } as CSSProperties;

  return createPortal(
    <div
      ref={overlayRef}
      className={cn("fixed inset-0 z-50 p-6", open ? "pointer-events-auto" : "pointer-events-none")}
    >
      <OverlayBackdrop open={open} onClick={onClose} ariaLabel="Close" />

      {/* Modal */}
      <div
        ref={modalFrameRef}
        className="fixed w-[calc(100vw-3rem)] max-w-[520px] max-h-[90dvh]"
        style={modalFrameStyle}
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className={cn(
            "w-full max-h-[90dvh] transition-[opacity,transform] duration-300",
            open ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <EmbossedCard className="relative w-full max-h-[90dvh] overflow-y-auto" style={embossedOverlayCardStyle}>
            <EmbossedCard.Header className="embed-modal-drag-handle flex cursor-grab items-center justify-between mb-3 active:cursor-grabbing">
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
                <RecessedCard padding="3px" radius={recessedSurfaceRadius} className="inline-flex">
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
        </div>
      </div>
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
