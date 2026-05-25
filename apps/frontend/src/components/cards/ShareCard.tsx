import { outerEmbossedCardClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { ShareButton } from "@/components/share/ShareButton";
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
  return cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className);
}

export function ShareCard({ content, className, animated = false }: ShareCardProps) {
  const t = useT();
  const shareable = isShareableContent(content) ? content : null;
  const sharePageContent = isSharePageContent(content) ? content : null;
  const shareUrl = sharePageContent?.shortUrl ?? shareable?.shareUrl;
  if (!shareUrl) return null;

  return (
    <EmbossedCard className={mediaCardClassName(animated, className)} style={solidEmbossedCardStyle}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>{t("share.title")}</EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        <div className="p-3">
          <ShareButton shareUrl={shareUrl} songTitle={content.title} artistName={content.artist} />
        </div>
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
