import { Service } from "@musiccloud/shared";
import { useEffect, useState } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { PlatformIcon } from "@/components/platform/PlatformIcon";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { creativeCommonsCopy } from "@/copy/creative-commons";
import { lookupCcBandcampUrl } from "@/lib/cc/bandcamp";

interface CcBandcampButtonProps {
  /** Jamendo track id, used to look up whether the track is also on Bandcamp. */
  jamendoId: string;
}

/**
 * "Buy on Bandcamp" button shown above the CC download button when the track is
 * also on Bandcamp.
 *
 * The Bandcamp presence is scraped server-side (seconds-long fuzzy search), so it
 * is fetched async after mount via `/api/cc/bandcamp/:jamendoId` and the button
 * only appears once a match comes back — mirroring the artist-column lazy-load.
 * The in-flight request is aborted on unmount / id change so a late response
 * never sets state on a stale tree. Give it a `key={jamendoId}` at the call site:
 * a track change then remounts it and resets the lookup, so a track with no
 * Bandcamp release never keeps the previously viewed track's button.
 *
 * @param jamendoId - The Jamendo track id to look up.
 */
export function CcBandcampButton({ jamendoId }: CcBandcampButtonProps) {
  const [bandcampUrl, setBandcampUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void lookupCcBandcampUrl(jamendoId, controller.signal)
      .then((url) => {
        if (url) setBandcampUrl(url);
      })
      .catch(() => {
        // Ignore — no button when the lookup fails or is aborted.
      });
    return () => controller.abort();
  }, [jamendoId]);

  if (!bandcampUrl) return null;

  return (
    <RecessedCard className={recessedControlInsetClassName}>
      <RecessedCard.Body>
        <EmbossedButton
          href={bandcampUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${creativeCommonsCopy.buyBandcamp} (${creativeCommonsCopy.opensInNewWindow})`}
          className="flex w-full items-center justify-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-primary no-underline"
        >
          <PlatformIcon platform={Service.BandCamp} className="size-5 flex-shrink-0" />
          <span className="truncate leading-none">{creativeCommonsCopy.buyBandcamp}</span>
        </EmbossedButton>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
