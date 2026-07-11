import { type ReactNode, useCallback, useState } from "react";
import type { AudioStatus } from "@/components/audio/AudioStatus";
import { CcTrackDetailsSection } from "@/components/cards/CcTrackDetailsSection";
import { animatedOuterEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { recordSwapKey } from "@/components/cards/recordSwapKey";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareButton } from "@/components/share/ShareButton";
import type { ShareMediaView } from "@/components/share/ShareMediaView.types";
import type { RecordLabel } from "@/components/turntable/RecordSwapStage";
import { TurntableAnalyzerSlot } from "@/components/turntable/TurntableAnalyzerSlot";
import { TurntablePlayer } from "@/components/turntable/TurntablePlayer";
import { TurntablePlayerProvider } from "@/components/turntable/TurntablePlayerProvider";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import type { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";
import { Turntable } from "@/components/vinyl/Turntable";
import { sideForTrackTitle } from "@/lib/media/vinyl-side.js";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";

/** The label data carried by the turntable compound for its inserted record. */
type VinylLabelRecord = RecordLabel;

/**
 * Maps resolved media content to the vinyl-label imprint fields.
 *
 * Kept in one place so the hub-driven deck and the static no-preview deck always
 * print the same label (cover art, title, artist, year, catalog, rights). The
 * title falls back through the LP album title, the album, then the track title,
 * matching the imprint the former inline turntable used.
 *
 * @param content - The resolved media content configuration.
 * @returns The {@link VinylLabelRecord} for the deck.
 */
function buildVinylLabelRecord(content: MediaCardContentConfiguration): VinylLabelRecord {
  return {
    labelArtworkUrl: content.artworkUrl,
    labelCatalogText: content.labelCatalogText,
    labelRightsText: content.labelRightsText,
    labelSubtitle: content.artist,
    labelTitle: content.labelAlbumTitle ?? content.album ?? content.title,
    labelYear: content.labelReleaseYear,
    vinylLayout: content.vinylLayout,
  };
}

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

/** Props for {@link MediaCardHeadStage}: the cover/VFD block plus the deck node. */
interface MediaCardHeadStageProps {
  content: MediaCardContentConfiguration;
  shareMediaView?: ShareMediaView;
  statusLine?: string;
  previewStatus?: AudioStatus | null;
  seekHint: { direction: VfdScrollOutDirection; nonce: number } | null;
  /**
   * The turntable deck rendered on the turntable view. The preview path supplies
   * the hub-driven {@link TurntablePlayer}; the no-preview path supplies a static
   * {@link Turntable}, so the deck only consumes the hub where a provider exists.
   */
  turntableStage: ReactNode;
}

/**
 * Renders the {@link SongInfo} cover/VFD block for the media head, handing it the
 * turntable deck node to show on the turntable view.
 *
 * Kept as its own component so the preview path can pass a hub-driven deck and
 * the no-preview path a static one, while the cover/VFD layout stays identical.
 *
 * @param props - {@link MediaCardHeadStageProps}.
 */
function MediaCardHeadStage({
  content,
  shareMediaView,
  statusLine,
  previewStatus,
  seekHint,
  turntableStage,
}: MediaCardHeadStageProps) {
  return (
    <SongInfo
      title={content.title}
      artist={content.artist}
      album={content.album}
      albumArtUrl={content.artworkUrl}
      isExplicit={content.isExplicit}
      metaOverride={content.metaLine}
      previewStatus={previewStatus}
      seekHint={seekHint}
      shareMediaView={shareMediaView}
      statusLine={statusLine}
      turntableStage={turntableStage}
    />
  );
}

/**
 * Shared embossed head for the media cards: the outer card chrome plus the
 * optional screen-reader announcement, the `SongInfo` cover/VFD block, the
 * collapsible audio-preview transport, and the collapsible share-actions button.
 *
 * Both the landing-page `MediaCard` (with platform sections passed as children)
 * and the share-page `MediaSummaryCard` (no children — its platform links live
 * in a separate `ServicesCard`) compose this head, so the entrance animation,
 * the record-swap key, and share-URL derivation stay in exactly one place.
 *
 * When the track has a preview, the cover block and the transport are wrapped in
 * a `TurntablePlayerProvider` (the audio hub). The provider persists across track
 * changes (it is NOT re-keyed): the audio engine reacts to the `previewUrl` prop
 * in place, and the outgoing record survives long enough for `RecordSwapStage` to
 * animate it out. The record's identity (`recordSwapKey`) drives BOTH sides of a
 * swap: it is handed to the provider (so a different album defers playback and
 * lets the deck coast to a halt instead of continuing) and to the deck (so the arc
 * swap runs). Same album keeps the record and continues playback seamlessly; a
 * different album stops, coasts, swaps and then auto-plays the new record. The
 * turntable stage renders the hub-driven {@link TurntablePlayer} deck, which reads
 * its spin/speed/power from the hub.
 * Without a preview there is no hub, so the stage gets a static {@link Turntable}
 * deck (idle spin) instead, keeping the hook out of the provider-less path.
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
  const swapKey = recordSwapKey(content);
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

  const labelRecord = buildVinylLabelRecord(content);

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      {srAnnouncement && (
        <p className="sr-only" aria-live="polite">
          {srAnnouncement}
        </p>
      )}

      {showPreview ? (
        <TurntablePlayerProvider
          previewUrl={content.previewUrl}
          refreshShortId={content.previewRefreshable ? content.shortId : undefined}
          mediaKind={content.mediaKind}
          trackTitle={content.title}
          recordSwapKey={swapKey}
          onSeekHint={handleSeekHint}
          onStatusChange={onPreviewStatusChange}
        >
          <MediaCardHeadStage
            content={content}
            shareMediaView={shareMediaView}
            statusLine={content.statusLine}
            previewStatus={previewStatus}
            seekHint={seekHint}
            turntableStage={
              <TurntablePlayer
                className="h-full w-full"
                record={{ ...labelRecord, className: "h-full w-full" }}
                swapKey={swapKey}
              />
            }
          />
          <CollapsibleSection
            visible
            sectionClass="px-[var(--mc-pad-card,0.75rem)] pt-0 pb-[var(--mc-pad-card,0.75rem)]"
          >
            <TurntableAnalyzerSlot />
          </CollapsibleSection>
        </TurntablePlayerProvider>
      ) : (
        <MediaCardHeadStage
          content={content}
          shareMediaView={shareMediaView}
          statusLine={content.statusLine}
          previewStatus={previewStatus}
          seekHint={seekHint}
          turntableStage={
            <Turntable
              className="h-full w-full"
              record={{
                ...labelRecord,
                className: "h-full w-full",
                sideLayout: sideForTrackTitle(content.vinylLayout, content.title) ?? undefined,
              }}
              swapKey={swapKey}
            />
          }
        />
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
