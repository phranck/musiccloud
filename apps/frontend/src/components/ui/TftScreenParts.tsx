import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Props for {@link TftScreenRoot}. */
interface TftScreenRootProps {
  /** The composed screen layers (cover, tint, grid, sheen, shadow). */
  children: ReactNode;
  /** Extra classes merged onto the screen frame. */
  className?: string;
}

/**
 * The TFT screen frame: the positioned, token-driven base every overlay layer
 * stacks on.
 *
 * The screen's day↔night background is cross-faded entirely in CSS from the
 * cover tokens (see `.mc-tft-screen` in `animations.css`). The root only owns
 * the frame; the cover artwork and the tint/grid/sheen/shadow overlays are
 * composed by the caller from the matching compound members, each pinned by a
 * fixed `z-index` in CSS so the stack order is independent of child order. Any
 * extra props (for example `data-media-stage`) pass straight through to the
 * underlying `<div>`.
 *
 * @param props - {@link TftScreenRootProps} plus any native `<div>` attributes.
 */
export function TftScreenRoot({
  children,
  className,
  ...rest
}: TftScreenRootProps & React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("mc-tft-screen relative", className)} {...rest}>
      {children}
    </div>
  );
}

/** Props for {@link TftScreenCover}. */
interface TftScreenCoverProps {
  /**
   * Artwork URL shortcut. When set, the cover renders an `<img>` (object-cover,
   * async decoding, self-hiding on load error). Omit it and pass {@link children}
   * instead to supply a bespoke content layer such as the cover-swap double
   * buffer.
   */
  image?: string;
  /** Accessible alt text for the {@link image} shortcut. */
  alt?: string;
  /** Extra classes merged onto the content wrapper. */
  className?: string;
  /** Bespoke content layer, used when {@link image} is not given. */
  children?: ReactNode;
}

/**
 * The screen's content layer (`z-index: 0`): the artwork sitting under every
 * overlay.
 *
 * Two modes, mutually exclusive:
 * - `image` — the convenience path: renders one `<img>` filling the screen
 *   (`object-cover`, `decoding="async"`) that hides itself on a load error so a
 *   broken source never leaves a torn box.
 * - `children` — the escape hatch for callers that need a custom content layer,
 *   such as the cover-swap outgoing/incoming double buffer animated by GSAP.
 *
 * Always renders the `mc-tft-screen-content` wrapper so the clip, paint
 * containment and z-order from `animations.css` apply regardless of mode.
 *
 * @param props - {@link TftScreenCoverProps}.
 */
export function TftScreenCover({ image, alt = "", className, children }: TftScreenCoverProps) {
  return (
    <div className={cn("mc-tft-screen-content", className)}>
      {image !== undefined ? (
        <img
          src={image}
          alt={alt}
          decoding="async"
          className="size-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Art-tint overlay (`z-index: 1`): the day↔night colour wash laid over the
 * artwork.
 *
 * Decorative, so it is hidden from assistive tech. Its colour cross-fades from
 * the cover tokens in CSS (`.mc-tft-screen-tint`).
 */
export function TftScreenTint() {
  return <div className="mc-tft-screen-tint" aria-hidden="true" />;
}

/**
 * LCD dot-matrix overlay (`z-index: 10`): the fine grid of phosphor dots that
 * gives the screen its LCD read.
 *
 * The compound member is named `Grid`; the CSS class stays
 * `mc-tft-screen-matrix`. Decorative, so it is hidden from assistive tech.
 */
export function TftScreenGrid() {
  return <div className="mc-tft-screen-matrix" aria-hidden="true" />;
}

/**
 * Sheen overlay (`z-index: 15`): the top-highlight-to-bottom-shade gradient that
 * reads as glass glare across the screen.
 *
 * Decorative, so it is hidden from assistive tech (`.mc-tft-screen-sheen`).
 */
export function TftScreenSheen() {
  return <div className="mc-tft-screen-sheen" aria-hidden="true" />;
}

/**
 * Inset frame shadow (`z-index: 20`): the top-left inner shadow that recesses the
 * screen into its bezel.
 *
 * Decorative, so it is hidden from assistive tech. Its strength cross-fades from
 * the cover tokens in CSS (`.mc-tft-screen-shadow`).
 */
export function TftScreenShadow() {
  return <div className="mc-tft-screen-shadow" aria-hidden="true" />;
}
