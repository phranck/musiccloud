import { type ReactNode, useCallback, useState } from "react";
import type { AudioStatus } from "@/components/audio/AudioStatus";
import { CcTrackDetailsSection } from "@/components/cards/CcTrackDetailsSection";
import { animatedOuterEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareButton } from "@/components/share/ShareButton";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { TurntableAnalyzerSlot } from "@/components/turntable/TurntableAnalyzerSlot";
import { useTurntablePlayer } from "@/components/turntable/TurntablePlayerContext";
import { TurntablePlayerProvider } from "@/components/turntable/TurntablePlayerProvider";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import type { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

interface MediaCardHeadProps {
  /** Resolved media content driving the cover, info, preview and share affordances. */
  content: MediaCardContentConfiguration;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page). */
  animated?: boolean;
  /** Extra classes merged onto the outer embossed card. */
  className?: string;
  /** Forwarded from the turntable hub so the caller can react to playback state. */
  onPreviewStatusChange?: (status: AudioStatus | null) => void;
  /** Current preview playback status, forwarded to the media visual stage. */
  previewStatus?: AudioStatus | null;
  /** Share-only cover/turntable visual mode. Omitted outside ShareLayout. */
  shareMediaView?: ShareMediaView;
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

/** Props for {@link MediaCardHeadStage}: the cover/VFD block with hub-driven spin. */
interface MediaCardHeadStageProps {
  content: MediaCardContentConfiguration;
  shareMediaView?: ShareMediaView;
  statusLine?: string;
  previewStatus?: AudioStatus | null;
  seekHint: { direction: VfdScrollOutDirection; nonce: number } | null;
  /**
   * Visual LP spin state for the turntable stage. Defaults to `Idle`; the
   * hub-connected `MediaCardHeadHubStage` overrides it with the live spin.
   */
  vinylSpinState?: VinylSpinState;
}

/**
 * Renders the {@link SongInfo} cover/VFD block for the media head.
 *
 * Kept as its own component so a hub-connected wrapper can inject the live spin
 * state while the no-preview path renders it with the default idle spin (no
 * turntable hub exists there).
 *
 * @param props - {@link MediaCardHeadStageProps}.
 */
function MediaCardHeadStage({
  content,
  shareMediaView,
  statusLine,
  previewStatus,
  seekHint,
  vinylSpinState = VinylSpinState.Idle,
}: MediaCardHeadStageProps) {
  return (
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
      statusLine={statusLine}
      vinylSpinState={vinylSpinState}
    />
  );
}

/**
 * Hub-connected variant of {@link MediaCardHeadStage}: reads the live spin state
 * from the turntable hub so the visible turntable spins in lock-step with
 * playback. Must render inside a `TurntablePlayerProvider`.
 *
 * @param props - The stage props minus `vinylSpinState`, which comes from the hub.
 */
function MediaCardHeadHubStage(props: Omit<MediaCardHeadStageProps, "vinylSpinState">) {
  const { spinState } = useTurntablePlayer();
  return <MediaCardHeadStage {...props} vinylSpinState={spinState} />;
}

/**
 * Shared embossed head for the media cards: the outer card chrome plus the
 * optional screen-reader announcement, the `SongInfo` cover/VFD block, the
 * collapsible audio-preview transport, and the collapsible share-actions button.
 *
 * Both the landing-page `MediaCard` (with platform sections passed as children)
 * and the share-page `MediaSummaryCard` (no children — its platform links live
 * in a separate `ServicesCard`) compose this head, so the entrance animation,
 * preview remount key, and share-URL derivation stay in exactly one place.
 *
 * When the track has a preview, the cover block and the transport are wrapped in
 * a `TurntablePlayerProvider` (the audio hub). The provider is keyed by the
 * content identity (`shortId`, `previewUrl`, title, artist) so swapping the
 * resolved track on the share page resets the engine cleanly instead of reusing
 * a stale instance. The hub owns the visual LP spin, which it feeds into the
 * cover stage; without a preview there is no hub and the stage stays idle.
 *
 * @param content - The resolved media content configuration.
 * @param animated - When true, plays the shared zoom-in entrance.
 * @param className - Optional extra classes for the outer card.
 * @param onPreviewStatusChange - Forwarded playback-status callback (from the hub).
 * @param previewStatus - Current preview playback status from the owner.
 * @param shareMediaView - Share-only cover/turntable visual mode.
 * @param srAnnouncement - Optional polite screen-reader announcement.
 * @param children - Optional platform sections rendered below the share actions.
 */
export function MediaCardHead({
  content,
  animated = true,
  className,
  onPreviewStatusChange,
  previewStatus,
  shareMediaView,
  srAnnouncement,
  children,
}: MediaCardHeadProps) {
  const shareable = isShareableContent(content) ? content : null;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareActionUrl = sharePageContent?.shortUrl ?? shareable?.shareUrl;
  const turntableHubKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
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
   * Receives a seek direction from the turntable hub and increments the nonce so
   * each keypress triggers a fresh overlay animation in `SongInfo`.
   *
   * @param direction - The direction of the +/-10 s arrow-key seek.
   */
  const handleSeekHint = useCallback((direction: VfdScrollOutDirection) => {
    setSeekHint((previous) => ({ direction, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  const stageContent = (
    <MediaCardHeadStage
      content={content}
      shareMediaView={shareMediaView}
      statusLine={content.statusLine}
      previewStatus={previewStatus}
      seekHint={seekHint}
    />
  );

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      {srAnnouncement && (
        <p className="sr-only" aria-live="polite">
          {srAnnouncement}
        </p>
      )}

      {showPreview ? (
        <TurntablePlayerProvider
          key={turntableHubKey}
          previewUrl={content.previewUrl}
          refreshShortId={content.previewRefreshable ? content.shortId : undefined}
          mediaKind={content.mediaKind}
          trackTitle={content.title}
          onSeekHint={handleSeekHint}
          onStatusChange={onPreviewStatusChange}
        >
          <MediaCardHeadHubStage
            content={content}
            shareMediaView={shareMediaView}
            statusLine={content.statusLine}
            previewStatus={previewStatus}
            seekHint={seekHint}
          />
          <CollapsibleSection
            visible
            sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
          >
            <TurntableAnalyzerSlot />
          </CollapsibleSection>
        </TurntablePlayerProvider>
      ) : (
        stageContent
      )}

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
