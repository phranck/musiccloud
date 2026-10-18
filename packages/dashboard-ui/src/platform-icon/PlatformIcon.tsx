import { getPlatformLabel, type ServiceId } from "@musiccloud/shared";
import { memo } from "react";

import { PLATFORM_ICON_FILES, PLATFORM_ICON_GLYPH_FILES } from "./platformIconFiles.js";

/** Presentation options shared by every web consumer of curated service artwork. */
export interface PlatformIconProps {
  /** The canonical service identifier whose bundled mark is drawn. */
  platform: ServiceId;
  /** Sizes the existing icon slot; the default remains 24 pixels square. */
  className?: string;
  /**
   * Uses original-color artwork when true. Otherwise an available transparent
   * glyph follows the text color; image-only marks retain their original colors.
   */
  colored?: boolean;
}

/**
 * Draws the same curated service artwork that supplies the Apple asset catalog.
 *
 * Generated paths cover every shared ServiceId at compile time. Unknown service
 * identifiers arriving from a newer backend draw nothing, preserving the existing
 * runtime fallback. Transparent glyph variants support text-color rendering
 * without masking an opaque app tile into an unrecognizable solid square.
 */
export const PlatformIcon = memo(function PlatformIcon({
  platform,
  className = "size-6",
  colored = false,
}: PlatformIconProps) {
  if (!Object.hasOwn(PLATFORM_ICON_FILES, platform)) return null;
  const glyph = PLATFORM_ICON_GLYPH_FILES[platform];

  if (!colored && glyph) {
    return (
      <span
        // eslint-disable-next-line react-doctor/prefer-tag-over-role -- A CSS mask needs currentColor; img would paint fixed-color content.
        role="img"
        aria-label={getPlatformLabel(platform)}
        className={`inline-block ${className}`}
        style={{
          backgroundColor: "currentColor",
          maskImage: `url("/icons/${glyph}")`,
          maskPosition: "center",
          maskRepeat: "no-repeat",
          maskSize: "contain",
        }}
      />
    );
  }

  return (
    <img
      src={`/icons/${PLATFORM_ICON_FILES[platform]}`}
      alt={getPlatformLabel(platform)}
      className={`object-contain ${className}`}
    />
  );
});
