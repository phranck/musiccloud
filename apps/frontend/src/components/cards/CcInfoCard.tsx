import { CcBandcampButton } from "@/components/cards/CcBandcampButton";
import { CcDownloadControl } from "@/components/cards/CcDownloadControl";
import { outerEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { SectionCardShell } from "@/components/cards/SectionCardShell";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/localeContext";
import type { CcTrackContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

/** The six standard Creative-Commons clause sets that ship a badge SVG under
 *  `/img/cc/`. CC0 / public-domain and any unknown clause set have no badge, so
 *  the card falls back to the parsed text label for those. */
const CC_ICON_CLAUSES = new Set(["by", "by-sa", "by-nc", "by-nc-sa", "by-nd", "by-nc-nd"]);

/**
 * Resolves a Creative-Commons deed URL to its licence-badge SVG path under
 * `/img/cc/`.
 *
 * The Jamendo `licenseCcurl` follows the shape
 * `https://creativecommons.org/licenses/<clauses>/<version>/`; the badge is keyed
 * by the clause set only (version-agnostic, so `3.0` and `4.0` share one badge).
 * Returns `undefined` when the URL is missing, is not a `/licenses/` deed, or
 * carries a clause set without a badge, letting the card fall back to text.
 *
 * @param licenseCcurl - The canonical CC deed URL, or `undefined`.
 * @returns The badge path (e.g. `/img/cc/cc-by-nc-nd.svg`), or `undefined`.
 */
function ccLicenseIconPath(licenseCcurl: string | undefined): string | undefined {
  if (!licenseCcurl) return undefined;
  try {
    const segments = new URL(licenseCcurl).pathname.split("/").filter(Boolean);
    if (segments[0] !== "licenses") return undefined;
    const clauses = segments[1];
    if (!clauses || !CC_ICON_CLAUSES.has(clauses)) return undefined;
    return `/img/cc/cc-${clauses}.svg`;
  } catch {
    return undefined;
  }
}

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
 * Renders the CC affordances a Jamendo result carries instead of streaming
 * links:
 *
 * 1. A meta row with the artist on the left and, on the same line, the licence
 *    badge on the right — the official CC clause badge
 *    (`/img/cc/cc-<clauses>.svg`) linking to the canonical deed. Falls back to
 *    the parsed `licenseLabel` text when no badge maps to the licence (CC0 /
 *    unknown clauses).
 * 2. A direct download button — only when Jamendo permits it
 *    (`downloadAllowed && downloadUrl`).
 * 3. An "Open on Jamendo" link to the canonical track page (`jamendoUrl`).
 *
 * Structure mirrors {@link ServicesCard}: a {@link SectionCardShell} with a
 * section header and a recessed well, so the geometry/token cascade and visual
 * language stay identical to the commercial layout.
 *
 * @param content - The resolved CC track content configuration.
 * @param className - Optional extra classes for the outer card.
 * @param animated - When true, plays the shared zoom-in entrance.
 */
export function CcInfoCard({ content, className, animated = false }: CcInfoCardProps) {
  const t = useT();
  const licenseLabel = content.licenseLabel;
  const iconPath = ccLicenseIconPath(content.licenseCcurl);
  const licenseAlt = licenseLabel ?? t("cc.licenseUnknown");
  const showDownload = content.downloadAllowed && !!content.downloadUrl;
  const showJamendo = !!content.jamendoUrl;

  return (
    <SectionCardShell
      title={t("cc.sectionTitle")}
      animated={animated}
      className={cn(outerEmbossedCardClassName, className)}
    >
      <div className="flex flex-col gap-[var(--mc-pad-card,0.75rem)] p-[var(--mc-pad-card,0.75rem)] pt-0">
        <RecessedCard className={recessedControlInsetClassName}>
          <RecessedCard.Body className="flex items-center justify-between gap-3 px-2 py-2">
            {content.artistJamendoUrl ? (
              <a
                href={content.artistJamendoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mc-cardlink min-w-0 truncate font-medium"
              >
                {content.artist}
              </a>
            ) : (
              <span className="min-w-0 truncate font-medium text-text-primary">{content.artist}</span>
            )}
            {iconPath ? (
              <a
                href={content.licenseCcurl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={licenseAlt}
                className="flex-shrink-0"
              >
                <img src={iconPath} alt={licenseAlt} className="block h-10 w-auto" />
              </a>
            ) : content.licenseCcurl ? (
              <a
                href={content.licenseCcurl}
                target="_blank"
                rel="noopener noreferrer"
                className="mc-cardlink flex-shrink-0 font-medium"
              >
                {licenseLabel ?? content.licenseCcurl}
              </a>
            ) : (
              <span className="flex-shrink-0 font-medium text-text-primary">{licenseAlt}</span>
            )}
          </RecessedCard.Body>
        </RecessedCard>

        {(content.jamendoTrackId || showDownload || showJamendo) && (
          <div className="flex flex-col gap-2">
            {/* Key by track id so a track change remounts the button — its
                Bandcamp lookup resets to "no match" instead of lingering on the
                previously viewed track's URL. */}
            {content.jamendoTrackId && (
              <CcBandcampButton key={content.jamendoTrackId} jamendoId={content.jamendoTrackId} />
            )}
            {showDownload && content.jamendoTrackId && (
              <CcDownloadControl jamendoId={content.jamendoTrackId} formatAriaLabel={t("cc.downloadFormat")} />
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
                    <img src="/icons/jamendo.svg" alt="" aria-hidden="true" className="size-5 flex-shrink-0" />
                    <span className="truncate leading-none">{t("cc.openOnJamendo")}</span>
                  </EmbossedButton>
                </RecessedCard.Body>
              </RecessedCard>
            )}
          </div>
        )}
      </div>
    </SectionCardShell>
  );
}
