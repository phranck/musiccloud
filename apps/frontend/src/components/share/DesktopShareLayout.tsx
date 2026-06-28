import type { ArtistInfoResponse } from "@musiccloud/shared";
import type {
  ArtistCardLabels,
  ArtistInfoStatus,
  ArtistPanelTrackResolveHandler,
} from "@/components/artist/artistPanelTypes";
import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { CcInfoCard } from "@/components/cards/CcInfoCard";
import { MediaSummaryCard } from "@/components/cards/MediaSummaryCard";
import { ServicesCard } from "@/components/cards/ServicesCard";
import { AnimatedArtistColumn } from "@/components/share/AnimatedArtistColumn";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { TwoColumnResultGrid } from "@/components/share/TwoColumnResultGrid";
import { ARTIST_W, MEDIA_W } from "@/components/share/twoColumnGeometry";
import type { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/** Props for {@link DesktopShareLayout}. */
export interface DesktopShareLayoutProps {
  /** Whether entry animations are enabled. */
  animated: boolean;
  /** Loaded artist-column data, or `null` while none is available. */
  artistData: ArtistInfoResponse | null;
  /** Current artist-info load phase. */
  artistLoadStatus: ArtistInfoStatus;
  /** Media-card content configuration (enriched with the VFD status line). */
  config: MediaCardContentConfiguration;
  /** Whether the artist column is in its loading phase. */
  isLoading: boolean;
  /** Section titles for the artist column. */
  labels: ArtistCardLabels;
  /** Called when a popular/similar row begins resolving (spinning-disc moment). */
  onArtistResolveStart: () => void;
  /** Reports a synchronous playback start intent before audio.play() resolves. */
  onPlaybackIntent: () => void;
  /** Reports the media-card preview player's status to the owner. */
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
  /** Resolves a clicked artist-panel track row. */
  onTrackResolve: ArtistPanelTrackResolveHandler;
  /** Current preview playback status, forwarded to the media visual stage. */
  previewStatus: AudioPreviewStatus | null;
  /** Current cover/turntable visual mode. */
  shareMediaView: ShareMediaView;
  /** Listener region used to localize artist-column data. */
  userRegion: string;
  /** Current visual LP spin state for the share turntable. */
  vinylSpinState: VinylSpinState;
}

/**
 * Desktop/tablet share layout: a two-column result grid with the media summary
 * card (plus an optional secondary card) on the left and the animated artist
 * column on the right.
 *
 * Rendered only on wide viewports (the grid's responsive container handles the
 * breakpoint); the mobile counterpart is {@link MobileShareLayout}.
 *
 * @param props - {@link DesktopShareLayoutProps}.
 */
export function DesktopShareLayout({
  animated,
  artistData,
  artistLoadStatus,
  config,
  isLoading,
  labels,
  onArtistResolveStart,
  onPlaybackIntent,
  onPreviewStatusChange,
  onTrackResolve,
  previewStatus,
  shareMediaView,
  userRegion,
  vinylSpinState,
}: DesktopShareLayoutProps) {
  return (
    <TwoColumnResultGrid
      left={
        <div className="flex flex-col gap-[var(--mc-gap-cards,1.5rem)]" style={{ width: `${MEDIA_W}px` }}>
          <MediaSummaryCard
            content={config}
            animated={animated}
            onPlaybackIntent={onPlaybackIntent}
            onPreviewStatusChange={onPreviewStatusChange}
            previewStatus={previewStatus}
            shareMediaView={shareMediaView}
            vinylSpinState={vinylSpinState}
          />
          {config.ccInfoContent ? (
            <CcInfoCard content={config.ccInfoContent} animated={animated} />
          ) : (
            <ServicesCard content={config} animated={animated} />
          )}
        </div>
      }
      right={
        <AnimatedArtistColumn
          artistData={artistData}
          artistLoadStatus={artistLoadStatus}
          isLoading={isLoading}
          labels={labels}
          onArtistResolveStart={onArtistResolveStart}
          onTrackResolve={onTrackResolve}
          userRegion={userRegion}
          widthPx={ARTIST_W}
        />
      }
    />
  );
}
