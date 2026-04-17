/**
 * Album artwork color extraction utilities.
 * Extracts dominant and accent colors from album art for dynamic theming.
 *
 * Pure algorithmic helpers (rgbToHsl, hslToRgb, extractAccent, pixel
 * sampling) live in `@musiccloud/shared/color` so the backend can run the
 * exact same extraction when generating procedural genre artworks.
 */

import { sampleAccentFromRgba } from "@musiccloud/shared";

export {
  type AlbumColors,
  type DynamicAccent,
  extractAccent,
  hslToRgb,
  rgbToHsl,
} from "@musiccloud/shared";

/**
 * Samples an HTMLImageElement via canvas and returns album colors + dynamic accent.
 * Must be called after the image has loaded (crossOrigin="anonymous" required).
 *
 * Accent strategy: hue-bucketing over a 64×64 sample. Near-black, near-white and
 * near-grey pixels are excluded so that unlit background tones don't dominate.
 * The hue range with the highest saturation-weighted pixel mass wins.
 */
export function extractAlbumColors(img: HTMLImageElement): ReturnType<typeof sampleAccentFromRgba> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      albumColors: { primary: "transparent", secondary: "transparent", tertiary: "transparent" },
      accent: null,
      avgRgb: [0, 0, 0],
    };
  }

  const size = 64;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  return sampleAccentFromRgba(data, size * size);
}
