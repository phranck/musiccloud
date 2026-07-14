import { UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { SlideArtworkKind, type SlideArtworkKind as SlideArtworkKindType } from "@/components/ui/SlideArtworkTypes";
import { VinylRecord } from "@/components/vinyl/VinylRecord";
import { VinylDiscFormat, VinylLabelVariant, VinylSpinState } from "@/components/vinyl/VinylRecord.types";

/** Props for {@link CoverImage}. */
interface CoverImageProps {
  /** URL of the cover artwork. Missing or failed square artwork renders the Generic Single. */
  artworkUrl?: string;
  /**
   * Tile shape: `round` for artists (user icon fallback), `square` for
   * tracks/albums (Generic Single fallback).
   */
  kind: SlideArtworkKindType;
  /** Pixel dimension for the `<img>` `width`/`height` attributes. */
  imgDim: number;
  /** Placeholder icon size in px. Defaults to 24. */
  iconSize?: number;
  /** `<img>` decoding hint. Defaults to `async`. */
  decoding?: "async" | "sync" | "auto";
}

/**
 * The inner cover leaf shared by the result-row tiles: an `<img>` that fills its
 * parent. Missing or failed square cover artwork renders the compact Generic
 * Single; missing round artist artwork keeps the centered user icon.
 *
 * Purely presentational and shell-agnostic: it knows nothing about the outer
 * frame (plain `div`, `RecessedCard`, disc/rim-shadow). The consumer wraps this
 * in whatever sized, shaped container it needs. The `<img>` carries `alt=""`
 * because the surrounding interactive element is expected to carry the label.
 */
export function CoverImage({ artworkUrl, kind, imgDim, iconSize = 24, decoding = "async" }: CoverImageProps) {
  const [failedArtworkUrl, setFailedArtworkUrl] = useState<string | null>(null);

  if (artworkUrl && artworkUrl !== failedArtworkUrl) {
    return (
      <img
        src={artworkUrl}
        alt=""
        className="w-full h-full object-cover"
        width={imgDim}
        height={imgDim}
        loading="lazy"
        decoding={decoding}
        onError={() => setFailedArtworkUrl(artworkUrl)}
      />
    );
  }

  if (kind === SlideArtworkKind.Square) {
    return (
      <div
        aria-hidden="true"
        className="flex h-full w-full items-center justify-center bg-surface-elevated"
        data-cover-fallback-disc="true"
      >
        <VinylRecord
          className="size-full"
          discFormat={VinylDiscFormat.Single}
          labelVariant={VinylLabelVariant.Generic}
          spinState={VinylSpinState.Idle}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-elevated">
      <UserIcon size={iconSize} weight="duotone" className="text-text-muted" />
    </div>
  );
}
