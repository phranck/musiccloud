import { ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { CcMetaRow } from "@/components/cards/CcMetaRow";
import { animatedOuterEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/localeContext";
import type { CcTrackContentConfiguration } from "@/lib/types/media-card";

interface CcInfoCardProps {
  content: CcTrackContentConfiguration;
  className?: string;
  /** Mirrors the sibling cards' entrance flag so the CC block joins the same zoom-in. */
  animated?: boolean;
}

/**
 * Creative-Commons companion card shown in place of the commercial platform
 * grid on the CC track page.
 *
 * Renders the four CC affordances a Jamendo result carries instead of
 * streaming-service links:
 *
 * 1. The exact CC licence as a labelled link to its canonical deed
 *    (`licenseCcurl`), labelled with the pre-parsed `licenseLabel`.
 * 2. The pre-formatted attribution credit line.
 * 3. A direct download button — only when Jamendo permits it
 *    (`downloadAllowed && downloadUrl`).
 * 4. An "Open on Jamendo" link to the canonical track page (`jamendoUrl`).
 *
 * Structure mirrors {@link ServicesCard}: an `EmbossedCard` with a section
 * header and a recessed button well, so the geometry/token cascade and visual
 * language stay identical to the commercial layout. The licence link opens in a
 * new tab with `rel="noopener noreferrer"`; the download anchor carries the
 * `download` attribute so the browser saves the file rather than navigating.
 *
 * @param content - The resolved CC track content configuration.
 * @param className - Optional extra classes for the outer card.
 * @param animated - When true, plays the shared zoom-in entrance.
 */
export function CcInfoCard({ content, className, animated = false }: CcInfoCardProps) {
  const t = useT();
  const licenseLabel = content.licenseLabel;
  const showDownload = content.downloadAllowed && !!content.downloadUrl;
  const showJamendo = !!content.jamendoUrl;

  return (
    <EmbossedCard className={animatedOuterEmbossedCardClassName(animated, className)}>
      <EmbossedCard.Header className={sectionCardHeaderClassName}>
        <EmbossedCard.Header.Title className={sectionCardTitleClassName}>
          {t("cc.sectionTitle")}
        </EmbossedCard.Header.Title>
      </EmbossedCard.Header>
      <EmbossedCard.Body>
        <div className="flex flex-col gap-[var(--mc-pad-card,0.75rem)] p-[var(--mc-pad-card,0.75rem)] pt-0">
          <RecessedCard className={recessedControlInsetClassName}>
            <RecessedCard.Body className="flex flex-col gap-2 px-3 py-3">
              <CcMetaRow label={t("cc.licenseLabel")}>
                {content.licenseCcurl ? (
                  <a
                    href={content.licenseCcurl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mc-skylink font-medium text-text-primary"
                  >
                    {licenseLabel ?? content.licenseCcurl}
                  </a>
                ) : (
                  <span className="font-medium text-text-primary">{licenseLabel ?? t("cc.licenseUnknown")}</span>
                )}
              </CcMetaRow>
              <CcMetaRow label={t("cc.attributionLabel")}>
                <span className="font-medium text-text-primary">{content.attribution}</span>
              </CcMetaRow>
            </RecessedCard.Body>
          </RecessedCard>

          {(showDownload || showJamendo) && (
            <div className="flex flex-col gap-2">
              {showDownload && (
                <RecessedCard className={recessedControlInsetClassName}>
                  <RecessedCard.Body>
                    <EmbossedButton
                      href={content.downloadUrl}
                      download
                      className="flex w-full items-center justify-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-primary no-underline"
                    >
                      <DownloadSimpleIcon weight="duotone" className="size-5 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate leading-none">{t("cc.download")}</span>
                    </EmbossedButton>
                  </RecessedCard.Body>
                </RecessedCard>
              )}
              {showJamendo && (
                <RecessedCard className={recessedControlInsetClassName}>
                  <RecessedCard.Body>
                    <EmbossedButton
                      href={content.jamendoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t("cc.openOnJamendo")} (${t("cc.opensInNewWindow")})`}
                      className="flex w-full items-center justify-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-primary no-underline"
                    >
                      <ArrowSquareOutIcon weight="duotone" className="size-5 flex-shrink-0" aria-hidden="true" />
                      <span className="truncate leading-none">{t("cc.openOnJamendo")}</span>
                    </EmbossedButton>
                  </RecessedCard.Body>
                </RecessedCard>
              )}
            </div>
          )}
        </div>
      </EmbossedCard.Body>
    </EmbossedCard>
  );
}
