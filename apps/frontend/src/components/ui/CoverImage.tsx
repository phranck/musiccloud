import { MusicNoteIcon, UserIcon } from "@phosphor-icons/react";
import { DEFAULT_COVER_FALLBACK_URL } from "@/components/ui/coverFallback";
import { SlideArtworkKind, type SlideArtworkKind as SlideArtworkKindType } from "@/components/ui/SlideArtworkTypes";

/** Props for {@link CoverImage}. */
interface CoverImageProps {
  /** URL of the cover artwork. When missing, a placeholder icon is shown instead. */
  artworkUrl?: string;
  /**
   * Tile shape: `round` for artists (→ user icon placeholder), `square` for
   * tracks/albums (→ music-note icon placeholder).
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
 * parent and falls back to {@link DEFAULT_COVER_FALLBACK_URL} on load error, or a
 * centered placeholder icon when no `artworkUrl` is given.
 *
 * Purely presentational and shell-agnostic: it knows nothing about the outer
 * frame (plain `div`, `RecessedCard`, disc/rim-shadow). The consumer wraps this
 * in whatever sized, shaped container it needs. The `<img>` carries `alt=""`
 * because the surrounding interactive element is expected to carry the label.
 */
export function CoverImage({ artworkUrl, kind, imgDim, iconSize = 24, decoding = "async" }: CoverImageProps) {
  if (artworkUrl) {
    return (
      <img
        src={artworkUrl}
        alt=""
        className="w-full h-full object-cover"
        width={imgDim}
        height={imgDim}
        loading="lazy"
        decoding={decoding}
        onError={(e) => {
          e.currentTarget.src = DEFAULT_COVER_FALLBACK_URL;
        }}
      />
    );
  }

  const FallbackIcon = kind === SlideArtworkKind.Round ? UserIcon : MusicNoteIcon;
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-elevated">
      <FallbackIcon size={iconSize} weight="duotone" className="text-text-muted" />
    </div>
  );
}
