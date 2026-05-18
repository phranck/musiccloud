import { CodeIcon } from "@phosphor-icons/react";
import { type CSSProperties, useState } from "react";
import { AudioPreviewPlayer, type AudioPreviewStatus } from "@/components/audio/AudioPreviewPlayer";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import { EmbedModal } from "@/components/share/EmbedModal";
import { ShareButton } from "@/components/share/ShareButton";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

export type { AudioPreviewStatus } from "@/components/audio/AudioPreviewPlayer";

export type {
  AlbumContentConfiguration,
  MediaCardContentConfiguration,
  MediaCardContentType,
  ShareContentConfiguration,
  SongContentConfiguration,
} from "@/lib/types/media-card";

interface MediaCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  /** Set to false to skip the zoom-in entrance animation (e.g. on the share page) */
  animated?: boolean;
  onPreviewStatusChange?: (status: AudioPreviewStatus) => void;
}

const MEDIA_CARD_BUTTON_RADIUS_STYLE = {
  "--neu-radius-base": "7px",
  "--neu-radius-sm": "11px",
} as CSSProperties;

export function MediaCard({ content, className, animated = true, onPreviewStatusChange }: MediaCardProps) {
  const t = useT();
  const shareable = isShareableContent(content) ? content : null;
  const shareUrl = shareable?.shareUrl;
  const srAnnouncement = shareable?.srAnnouncement;
  const onAlbumArtLoad = content.onAlbumArtLoad;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const [embedOpen, setEmbedOpen] = useState(false);
  const isAlbum = content.type === "album" || sharePageContent?.platformsLabelKey === "results.openAlbumOn";
  const audioPreviewKey = [content.shortId ?? "", content.previewUrl ?? "", content.title, content.artist].join("::");
  const showPreview = !!(content.previewUrl || (content.previewRefreshable && content.shortId));
  const showShareButton = !!shareUrl;
  const showSharePageActions = !!sharePageContent;
  const showPlatforms = content.platforms.length > 0;
  const showPlatformsInfoOnly = content.platforms.length === 0 && !!content.platformsInfo;
  return (
    <EmbossedCard
      className={cn(
        "w-full max-w-full sm:max-w-lg mx-auto rounded-[1.375rem] sm:rounded-[1.625rem] p-0",
        animated && "animate-zoom-in",
        className,
      )}
    >
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
        metaOverride={content.metaLine}
        statusLine={content.statusLine}
        statusActive={content.statusActive}
        onAlbumArtLoad={onAlbumArtLoad}
      />

      <CollapsibleSection visible={showPreview} sectionClass="px-3 pt-0 pb-3">
        {showPreview && (
          <AudioPreviewPlayer
            key={audioPreviewKey}
            previewUrl={content.previewUrl}
            refreshShortId={content.previewRefreshable ? content.shortId : undefined}
            trackTitle={content.title}
            onStatusChange={onPreviewStatusChange}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showShareButton} sectionClass="p-3">
        {shareUrl && <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />}
      </CollapsibleSection>

      <CollapsibleSection visible={showSharePageActions} sectionClass="p-3">
        {sharePageContent && (
          <>
            <div className="flex flex-col gap-0.5">
              <ShareButton shareUrl={sharePageContent.shortUrl} songTitle={content.title} artistName={content.artist} />
              <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
                <RecessedCard.Body>
                  <EmbossedButton
                    as="button"
                    type="button"
                    onClick={() => setEmbedOpen(true)}
                    className={cn(
                      "mc-raised-control flex items-center justify-center gap-2",
                      "w-full rounded-[7px] sm:rounded-[11px] font-semibold text-[15px] tracking-[-0.01em]",
                      "min-h-[50px]",
                    )}
                    style={MEDIA_CARD_BUTTON_RADIUS_STYLE}
                  >
                    <CodeIcon size={20} weight="duotone" />
                    {isAlbum ? t("embed.buttonAlbum") : t("embed.button")}
                  </EmbossedButton>
                </RecessedCard.Body>
              </RecessedCard>
            </div>
            <EmbedModal
              open={embedOpen}
              onClose={() => setEmbedOpen(false)}
              shortUrl={sharePageContent.shortUrl}
              title={content.title}
              artist={content.artist}
              artworkUrl={content.artworkUrl}
              metaLine={content.metaLine}
              album={content.album}
              isAlbum={isAlbum}
              platforms={content.platforms}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showPlatforms} sectionClass="p-3">
        {showPlatforms && (
          <>
            <RecessedCard className="p-[0.1875rem]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
              <RecessedCard.Header>
                <RecessedCard.Header.Title>{content.platformsLabel}</RecessedCard.Header.Title>
              </RecessedCard.Header>
              <RecessedCard.Body>
                <AnimatedPlatformGrid platforms={content.platforms} songTitle={content.title} />
              </RecessedCard.Body>
            </RecessedCard>
            {content.platformsInfo && (
              <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection visible={showPlatformsInfoOnly} sectionClass="p-3">
        {showPlatformsInfoOnly && <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>}
      </CollapsibleSection>
    </EmbossedCard>
  );
}
