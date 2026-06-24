import { XIcon } from "@phosphor-icons/react";
import { useT } from "@/i18n/localeContext";

interface ArtistCardCloseButtonProps {
  /** Closes the artist panel / bottom sheet. */
  onClose: () => void;
}

/**
 * Absolute-positioned close (X) button shared by the mobile artist panel's
 * populated card ({@link import("./ArtistInfoCard").ArtistInfoCard}) and its
 * notice/empty-state card ({@link import("./ArtistInfoNoticeCard").ArtistInfoNoticeCard}).
 * Sits top-right inside the card's `relative` wrapper and is labeled for screen
 * readers via the `artist.closeInfo` key.
 */
export function ArtistCardCloseButton({ onClose }: ArtistCardCloseButtonProps) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute top-3 right-3 z-10 p-1.5 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.08] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      aria-label={t("artist.closeInfo")}
    >
      <XIcon size={16} weight="duotone" />
    </button>
  );
}
