import { CodeIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { EmbedModal } from "@/components/share/EmbedModal";
import { ShareButton } from "@/components/share/ShareButton";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { isShareableContent, isSharePageContent, type MediaCardContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";
import { solidEmbossedCardStyle } from "@/styles/neumorphic";

interface ShareCardProps {
  content: MediaCardContentConfiguration;
  className?: string;
  animated?: boolean;
}

function mediaCardClassName(animated: boolean, className?: string) {
  return cn(
    "w-full max-w-full sm:max-w-lg mx-auto rounded-[1.375rem] sm:rounded-[1.625rem] p-0",
    animated && "animate-zoom-in",
    className,
  );
}

export function ShareCard({ content, className, animated = false }: ShareCardProps) {
  const t = useT();
  const shareable = isShareableContent(content) ? content : null;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareUrl = sharePageContent?.shortUrl ?? shareable?.shareUrl;
  const [embedOpen, setEmbedOpen] = useState(false);
  const isAlbum = content.type === "album" || sharePageContent?.platformsLabelKey === "results.openAlbumOn";

  if (!shareUrl) return null;

  return (
    <EmbossedCard className={mediaCardClassName(animated, className)} style={solidEmbossedCardStyle}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{t("share.title")}</EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        <div className="flex flex-col gap-3 p-3">
          <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />
          {sharePageContent && (
            <RecessedCard className="p-[0.1875rem] h-[47px]" radius={{ base: "0.625rem", sm: "0.875rem" }}>
              <RecessedCard.Body className="h-full">
                <EmbossedButton
                  as="button"
                  type="button"
                  onClick={() => setEmbedOpen(true)}
                  className={cn(
                    "flex h-full min-h-0 items-center justify-center gap-2 py-0",
                    "w-full font-semibold text-[15px] tracking-[-0.01em]",
                  )}
                >
                  <CodeIcon size={20} weight="duotone" />
                  {isAlbum ? t("embed.buttonAlbum") : t("embed.button")}
                </EmbossedButton>
              </RecessedCard.Body>
            </RecessedCard>
          )}
        </div>
      </EmbossedCard.Body>
      {sharePageContent && (
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
      )}
    </EmbossedCard>
  );
}
