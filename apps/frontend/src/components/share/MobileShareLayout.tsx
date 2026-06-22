import { MicrophoneStageIcon } from "@phosphor-icons/react";
import type { CSSProperties, ReactNode } from "react";
import type { AudioPreviewStatus } from "@/components/audio/AudioPreviewStatus";
import { raisedControlRadius, recessedControlInset } from "@/components/cards/cardGeometry";
import { SharePageCard } from "@/components/share/SharePageCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import type { MediaCardContentConfiguration } from "@/lib/types/media-card";

/** Props for {@link MobileShareLayout}. */
export interface MobileShareLayoutProps {
  /** Whether entry animations are enabled. */
  animated: boolean;
  /** Media-card content configuration (enriched with the VFD status line). */
  config: MediaCardContentConfiguration;
  /** Translated label for the artist-info button. */
  label: string;
  /** Opens the artist-info bottom sheet. */
  onOpenSheet: () => void;
  /** Reports the share-card preview player's status to the owner. */
  onPreviewStatusChange: (status: AudioPreviewStatus | null) => void;
  /** Optional card rendered below the share card (CC license / attribution). */
  secondaryCard?: ReactNode;
}

/**
 * Mobile share layout: the share card (with an optional secondary card below)
 * plus a button that opens the artist-info bottom sheet
 * ({@link MobileArtistSheet}).
 *
 * Rendered only on narrow viewports (`min-[1080px]:hidden`); the desktop
 * counterpart is {@link DesktopShareLayout}.
 *
 * @param props - {@link MobileShareLayoutProps}.
 */
export function MobileShareLayout({
  animated,
  config,
  label,
  onOpenSheet,
  onPreviewStatusChange,
  secondaryCard,
}: MobileShareLayoutProps) {
  return (
    <div className="block min-[1080px]:hidden">
      <SharePageCard config={config} animated={animated} onPreviewStatusChange={onPreviewStatusChange} />
      {secondaryCard && <div className="mt-[var(--mc-gap-cards,1.5rem)]">{secondaryCard}</div>}
      <div className="mt-3 flex justify-center px-3">
        <EmbossedButton
          as="button"
          type="button"
          onClick={onOpenSheet}
          className="flex min-h-[48px] w-[calc((100%-0.125rem)/2-var(--mc-recessed-control-inset))] items-center justify-center gap-3 px-3 text-base text-text-primary max-[389px]:min-h-[40px] max-[389px]:gap-1.5 max-[389px]:px-2 max-[389px]:text-[13px] max-[389px]:font-normal min-[390px]:font-medium"
          style={
            {
              "--mc-recessed-control-inset": recessedControlInset,
              "--neu-radius-base": raisedControlRadius,
              "--neu-radius-sm": raisedControlRadius,
            } as CSSProperties
          }
        >
          <MicrophoneStageIcon className="size-6 flex-shrink-0 max-[389px]:size-5" weight="duotone" />
          <span className="truncate leading-none">{label}</span>
        </EmbossedButton>
      </div>
    </div>
  );
}
