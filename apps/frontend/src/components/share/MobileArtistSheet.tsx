import type { ArtistInfoResponse } from "@musiccloud/shared";
import { XIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { ArtistInfoCard } from "@/components/artist/ArtistInfoCard";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { cn } from "@/lib/utils";

/** Props for {@link MobileArtistSheet}. */
export interface MobileArtistSheetProps {
  /** Loaded artist-column data, or `null` while none is available. */
  artistData: ArtistInfoResponse | null;
  /** Current artist-info load phase. */
  artistLoadStatus: ArtistInfoStatus;
  /** Translated accessible label for the close affordances. */
  closeLabel: string;
  /** Whether the artist-info load is in its loading phase. */
  isLoading: boolean;
  /** Section titles for the artist column. */
  labels: ArtistCardLabels;
  /** Called when a popular/similar row begins resolving (spinning-disc moment). */
  onArtistResolveStart: () => void;
  /** Closes the sheet. */
  onClose: () => void;
  /** Resolves a clicked artist-panel track row. */
  onTrackResolve: ArtistPanelTrackResolveHandler;
  /** Whether the sheet is open. */
  open: boolean;
  /** Listener region used to localize artist-column data. */
  userRegion: string;
}

/**
 * Mobile bottom sheet hosting the {@link ArtistInfoCard}.
 *
 * Slides up from the bottom when `open`, dims the page via
 * {@link OverlayBackdrop}, and renders a drag-handle plus close button. When a
 * track row resolves, the sheet closes and the page smooth-scrolls to the top
 * before awaiting the caller's resolve, so the resolved result lands in view.
 *
 * Mounted into a portal by the share layout; visibility is driven by the `open`
 * prop (the sheet never unmounts on close, to keep the slide-out animation).
 *
 * @param props - {@link MobileArtistSheetProps}.
 */
export function MobileArtistSheet({
  artistData,
  artistLoadStatus,
  closeLabel,
  isLoading,
  labels,
  onArtistResolveStart,
  onClose,
  onTrackResolve,
  open,
  userRegion,
}: MobileArtistSheetProps) {
  const handleTrackResolve = useCallback<ArtistPanelTrackResolveHandler>(
    async (track) => {
      onClose();
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "smooth" }));
      await onTrackResolve(track);
    },
    [onClose, onTrackResolve],
  );

  return (
    <div>
      <div
        className={cn(
          "fixed inset-0 z-50 flex flex-col justify-end",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <OverlayBackdrop open={open} onClick={onClose} ariaLabel={closeLabel} />
        <div
          className={cn(
            "relative z-10 rounded-t-[36px] bg-surface-elevated max-h-[85dvh] flex flex-col",
            "transition-transform duration-300 ease-out",
            open ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
            <div className="w-8" />
            <div className="h-1 w-10 rounded-full bg-[var(--border)]" />
            <button
              type="button"
              onClick={onClose}
              className="size-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-text-secondary hover:bg-white/[0.12] hover:text-text-primary transition-colors"
              aria-label={closeLabel}
            >
              <XIcon size={16} weight="duotone" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 pb-8">
            <ArtistInfoCard
              data={artistData}
              isLoading={isLoading}
              labels={labels}
              status={artistLoadStatus}
              userRegion={userRegion}
              onTrackResolve={handleTrackResolve}
              onResolveStart={onArtistResolveStart}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
