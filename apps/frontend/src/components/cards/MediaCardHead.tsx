import { type ReactNode, useCallback, useState } from "react";
import { AudioPlayer } from "@/components/audio/AudioPlayer";
import type { AudioStatus } from "@/components/audio/AudioStatus";
import { CcTrackDetailsSection } from "@/components/cards/CcTrackDetailsSection";
import { animatedOuterEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareButton } from "@/components/share/ShareButton";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import type { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import type { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

interface MediaCardHeadProps {
  /** Resolved media content driving the cover, info, preview and share affordances. */
  content: MediaCardContentConfiguration;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page). */
  animated?: boolean;
  /** Extra classes merged onto the outer embossed card. */
  className?: string;
  /** Reports a synchronous playback start intent before audio.play() resolves. */
  onPlaybackIntent?: () => void;
  /** Forwarded from the audio preview player so the caller can react to playback state. */
  onPreviewStatusChange?: (status: AudioStatus | null) => void;
  /** Current preview playback status, forwarded to the media visual stage. */
  previewStatus?: AudioStatus | null;
  /** Share-only cover/turntable visual mode. Omitted outside ShareLayout. */
  shareMediaView?: ShareMediaView;
  /** Share-only visual LP spin state. */
  vinylSpinState?: VinylSpinState;
  /**
   * Pre-translated screen-reader announcement rendered as a polite live region
   * above the cover. Only the landing-page `MediaCard` supplies this; the share
   * page's summary card omits it.
   */
  srAnnouncement?: string;
  /**
   * Platform sections rendered below the share actions. The landing-page
   * `MediaCard` passes its platform grid here; `MediaSummaryCard` renders no
   * children because the platform links live in a separate `ServicesCard`.
   */
  children?: ReactNode;
}

/**
 * Shared embossed head for the media cards: the outer card chrome plus the
 * optional screen-reader announcement, the `SongInfo` cover/VFD block, the
 * collapsible audio-preview player, and the collapsible share-actions button.
 *
 * Both the landing-page `MediaCard` (with platform sections passed as children)
 * and the share-page `MediaSummaryCard` (no children — its platform links live
 * in a separate `ServicesCard`) compose this head, so the entrance animation,
 * preview remount key, and share-URL derivation stay in exactly one place.
 *
 * The audio player is remounted via a `key` derived from the content identity
 * (`shortId`, `previewUrl`, title, artist) so swapping the resolved track on the
 * share page restarts the player cleanly instead of reusing a stale instance.
 *
 * @param content - The resolved media content configuration.
 * @param animated - When true, plays the shared zoom-in entrance.
 * @param className - Optional extra classes for the outer card.
 * @param onPlaybackIntent - Forwarded audio-preview intent callback.
 * @param onPreviewStatusChange - Forwarded audio-preview status callback.
 * @param srAnnouncement - Optional polite screen-reader announcement.
 * @param children - Optional platform sections rendered below the share actions.
 */
export function MediaCardHead({
  content,
  animated = true,
  className,
  onPlaybackIntent,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
  vinylSpinState,
  srAnnouncement,
  children,
}: MediaCardHeadProps) {
  const shareable = isShareableContent(content) ? content : null;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareActionUrl = sharePageContent?.shortUrl ?? shareable?.shareUrl;
  const audioPlayerKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
  const showPreview = !!(content.previewUrl || (content.previewRefreshable && content.shortId));
  const showShareActions = !!shareActionUrl;

  /**
   * Transient seek-hint state. The nonce monotonically increases on each
   * arrow-key seek so that `SongInfo`'s VFD overlay re-arms even when the
   * direction is the same as the previous keypress ("jeder Druck neu").
   * Null when no hint is in flight (initial state, after the overlay expires).
   */
  const [seekHint, setSeekHint] = useState<{ direction: VfdScrollOutDirection; nonce: number } | null>(null);

  /**
   * Receives a seek direction from `AudioPlayer` and increments the
   * nonce so each keypress triggers a fresh overlay animation in `SongInfo`.
   *
   * @param direction - The direction of the ±10 s arrow-key seek.
   */
  const handleSeekHint = useCallback((direction: VfdScrollOutDirection) => {
    setSeekHint((previous) => ({ direction, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      {srAnnouncement && (
        <p className="sr-only" aria-live="polite">
          {srAnnouncement}
        </p>
      )}

      <SongInfo
        title={content.title}
        artist={content.artist}
        album={content.album}
        albumArtUrl={content.artworkUrl}
        isExplicit={content.isExplicit}
        labelAlbumTitle={content.labelAlbumTitle}
        labelCatalogText={content.labelCatalogText}
        labelRightsText={content.labelRightsText}
        labelReleaseYear={content.labelReleaseYear}
        metaOverride={content.metaLine}
        previewStatus={previewStatus}
        seekHint={seekHint}
        shareMediaView={shareMediaView}
        statusLine={content.statusLine}
        vinylSpinState={vinylSpinState}
      />

      <CollapsibleSection
        visible={showPreview}
        sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
      >
        {showPreview && (
          <AudioPlayer
            key={audioPlayerKey}
            previewUrl={content.previewUrl}
            refreshShortId={content.previewRefreshable ? content.shortId : undefined}
            mediaKind={content.mediaKind}
            trackTitle={content.title}
            onPlaybackIntent={onPlaybackIntent}
            onSeekHint={handleSeekHint}
            onStatusChange={onPreviewStatusChange}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        visible={showShareActions}
        sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
      >
        {shareActionUrl && (
          <ShareButton shareUrl={shareActionUrl} songTitle={content.title} artistName={content.artist} />
        )}
      </CollapsibleSection>

      {children}

      {/* Creative-Commons tracks fold their musicinfo/stats in here as a
          collapsible section at the foot of the card; it self-hides (divider and
          all) when there are no details, and commercial cards carry no
          `ccInfoContent`, so neither path renders anything extra. */}
      {content.ccInfoContent && <CcTrackDetailsSection content={content.ccInfoContent} />}
    </EmbossedCard>
  );
}
