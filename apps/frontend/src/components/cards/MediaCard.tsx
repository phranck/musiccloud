import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { CodeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { AudioPreviewPlayer } from "@/components/audio/AudioPreviewPlayer";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SongInfo } from "@/components/cards/SongInfo";
import { PlatformButton } from "@/components/platform/PlatformButton";
import { EmbedModal } from "@/components/share/EmbedModal";
import { ShareButton } from "@/components/share/ShareButton";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

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
}

export function MediaCard({ content, className, animated = true }: MediaCardProps) {
  const t = useT();
  const shareable = isShareableContent(content) ? content : null;
  const shareUrl = shareable?.shareUrl;
  const srAnnouncement = shareable?.srAnnouncement;
  const onAlbumArtLoad = content.onAlbumArtLoad;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const [embedOpen, setEmbedOpen] = useState(false);
  const isAlbum = content.type === "album" || sharePageContent?.platformsLabelKey === "results.openAlbumOn";

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
        onAlbumArtLoad={onAlbumArtLoad}
      />

      {(content.previewUrl || (content.previewRefreshable && content.shortId)) && (
        <div className="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body>
              <AudioPreviewPlayer
                previewUrl={content.previewUrl}
                refreshShortId={content.previewRefreshable ? content.shortId : undefined}
                trackTitle={content.title}
              />
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      )}

      {shareUrl && (
        <div className="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body>
              <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />
            </RecessedCard.Body>
          </RecessedCard>
        </div>
      )}

      {sharePageContent && (
        <div className="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Body className="flex flex-col gap-1.5">
              <ShareButton shareUrl={sharePageContent.shortUrl} songTitle={content.title} artistName={content.artist} />
              <EmbossedButton
                as="button"
                type="button"
                onClick={() => setEmbedOpen(true)}
                className={cn(
                  "flex items-center justify-center gap-2",
                  "w-full rounded-[4px] sm:rounded-lg font-semibold text-[15px] tracking-[-0.01em]",
                  "min-h-[50px]",
                )}
              >
                <CodeIcon size={20} weight="duotone" />
                {isAlbum ? t("embed.buttonAlbum") : t("embed.button")}
              </EmbossedButton>
            </RecessedCard.Body>
          </RecessedCard>
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
        </div>
      )}

      {content.platforms.length > 0 && (
        <div className="p-3">
          <RecessedCard className="p-1.5" radius={{ base: "0.625rem", sm: "0.875rem" }}>
            <RecessedCard.Header>
              <RecessedCard.Header.Title>{content.platformsLabel}</RecessedCard.Header.Title>
            </RecessedCard.Header>
            <RecessedCard.Body className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {[...content.platforms]
                .filter((p) => !PLATFORM_CONFIG[p.platform]?.hidden)
                .sort((a, b) => PLATFORM_CONFIG[a.platform].label.localeCompare(PLATFORM_CONFIG[b.platform].label))
                .map((p) => (
                  <PlatformButton
                    key={p.platform}
                    platform={p.platform}
                    url={p.url}
                    songTitle={content.title}
                    displayName={p.displayName}
                    matchMethod={p.matchMethod}
                  />
                ))}
            </RecessedCard.Body>
          </RecessedCard>
          {content.platformsInfo && (
            <p className="text-sm text-text-secondary text-center mt-4">{content.platformsInfo}</p>
          )}
        </div>
      )}

      {content.platforms.length === 0 && content.platformsInfo && (
        <div className="p-3">
          <p className="text-sm text-text-secondary text-center">{content.platformsInfo}</p>
        </div>
      )}
    </EmbossedCard>
  );
}
