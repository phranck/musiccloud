import { ArrowSquareOutIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { outerEmbossedCardClassName, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { sectionCardHeaderClassName, sectionCardTitleClassName } from "@/components/cards/sectionCardChromeStyles";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/localeContext";
import type { CcTrackContentConfiguration } from "@/lib/types/media-card";
import { cn } from "@/lib/utils";

/** Human-readable label for a Creative Commons clause segment (`by`, `nc`, …). */
const CC_CLAUSE_LABELS: Record<string, string> = {
  by: "BY",
  nc: "NC",
  nd: "ND",
  sa: "SA",
  zero: "0",
};

/**
 * The two path roots a Creative Commons deed URL can start with.
 *
 * Stored as a domain-literal namespace (not inline string comparisons) so the
 * `kind` discriminant in {@link ccLicenseLabel} compares against a single source
 * of truth, satisfying the domain-literals Doctor rule.
 */
const CcDeedKind = {
  Licenses: "licenses",
  PublicDomain: "publicdomain",
} as const;

/**
 * Derives a display label such as `CC BY-NC-ND 3.0` from a canonical Creative
 * Commons deed URL.
 *
 * The Jamendo `licenseCcurl` follows the shape
 * `https://creativecommons.org/licenses/<clauses>/<version>/`, where `<clauses>`
 * is a dash-separated list (`by`, `by-nc-nd`, …) and `<version>` is the licence
 * version (`3.0`, `4.0`). Public-domain dedications use the `publicdomain/zero`
 * path. We keep this intentionally small (KISS): unknown clause tokens are
 * upper-cased verbatim so any future CC variant still renders something useful.
 *
 * @param url - The canonical CC deed URL, or `undefined` when Jamendo omits it.
 * @returns A short licence label (e.g. `CC BY 4.0`), or `undefined` when the URL
 *   is missing or cannot be parsed into the expected `/licenses|publicdomain/…`
 *   shape.
 */
function ccLicenseLabel(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    // Expected: ["licenses", "<clauses>", "<version>"] or
    //           ["publicdomain", "zero", "<version>"].
    const kind = segments[0];
    if (kind !== CcDeedKind.Licenses && kind !== CcDeedKind.PublicDomain) return undefined;
    const clauses = segments[1];
    const version = segments[2];
    if (!clauses) return undefined;
    const clauseLabel = clauses
      .split("-")
      .map((clause) => CC_CLAUSE_LABELS[clause] ?? clause.toUpperCase())
      .join("-");
    return ["CC", clauseLabel, version].filter(Boolean).join(" ");
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
 * Renders the four CC affordances a Jamendo result carries instead of
 * streaming-service links:
 *
 * 1. The exact CC licence as a labelled link to its canonical deed
 *    (`licenseCcurl`), parsed via {@link ccLicenseLabel}.
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
  const licenseLabel = ccLicenseLabel(content.licenseCcurl);
  const showDownload = content.downloadAllowed && !!content.downloadUrl;
  const showJamendo = !!content.jamendoUrl;

  return (
    <EmbossedCard className={cn(outerEmbossedCardClassName, animated && "animate-zoom-in", className)}>
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

/**
 * A single label/value row inside the CC metadata well.
 *
 * Keeps the label muted and right-aligns the value so the licence and
 * attribution rows read as a compact definition list without hardcoding any
 * structural spacing outside the token cascade.
 *
 * @param label - The pre-translated row label (e.g. "License").
 * @param children - The value node (link or text).
 */
function CcMetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-sm">{children}</span>
    </div>
  );
}
