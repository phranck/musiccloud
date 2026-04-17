/**
 * Color primitives shared between frontend (Canvas pixel sampling) and
 * backend (jimp pixel sampling for server-rendered genre artworks).
 *
 * Only pure, environment-agnostic helpers live here — no Canvas, no jimp,
 * no DOM, no Buffer. Keeping the algorithm in one place avoids drift
 * between client-side and server-side accent extraction.
 */

export interface AlbumColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface DynamicAccent {
  base: string;
  hover: string;
  glow: string;
  contrastText: string;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function extractAccent(r: number, g: number, b: number): DynamicAccent | null {
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.1) return null;
  const [ar, ag, ab] = hslToRgb(h, Math.max(s, 0.5), 0.55);
  const [hr, hg, hb] = hslToRgb(h, Math.max(s, 0.5), 0.65);
  const brightness = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  return {
    base: toHex(ar, ag, ab),
    hover: toHex(hr, hg, hb),
    glow: `rgba(${ar}, ${ag}, ${ab}, 0.25)`,
    contrastText: brightness > 0.6 ? "#000000" : "#ffffff",
  };
}

// ─── Pixel sampling (environment-independent) ──────────────────────────────

interface HueBucket {
  sumR: number;
  sumG: number;
  sumB: number;
  weight: number;
}

/**
 * Saturation-weighted hue-bucketing over raw RGBA pixel data (4 bytes per
 * pixel). Works for Canvas `ImageData.data` on the frontend and for jimp's
 * `Buffer`-style bitmap on the backend — both expose the same layout.
 *
 * Returns the extracted accent plus the average color of all sampled pixels
 * (used for the blob overlays in the frontend's share layout).
 *
 * Strategy: near-black (L < 0.1), near-white (L > 0.9), and near-grey
 * (S < 0.12) pixels are excluded — they carry no useful hue signal. The
 * remaining pixels go into 36 hue buckets (10° per bucket), weighted by
 * saturation and lightness distance from midpoint. The heaviest bucket
 * wins.
 */
export function sampleAccentFromRgba(
  data: Uint8Array | Uint8ClampedArray | Buffer,
  pixelCount: number,
): { albumColors: AlbumColors; accent: DynamicAccent | null; avgRgb: [number, number, number] } {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  const HUE_BUCKETS = 36;
  const buckets: HueBucket[] = Array.from({ length: HUE_BUCKETS }, () => ({
    sumR: 0,
    sumG: 0,
    sumB: 0,
    weight: 0,
  }));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;

    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.1 || l > 0.9 || s < 0.12) continue;

    const weight = s * (1 - Math.abs(l - 0.5) * 1.5);
    if (weight <= 0) continue;

    const idx = Math.floor(h * HUE_BUCKETS) % HUE_BUCKETS;
    buckets[idx].sumR += r * weight;
    buckets[idx].sumG += g * weight;
    buckets[idx].sumB += b * weight;
    buckets[idx].weight += weight;
  }

  const avgR = Math.round(totalR / pixelCount);
  const avgG = Math.round(totalG / pixelCount);
  const avgB = Math.round(totalB / pixelCount);

  const albumColors: AlbumColors = {
    primary: `rgba(${avgR}, ${avgG}, ${avgB}, 0.25)`,
    secondary: `rgba(${Math.min(avgR + 40, 255)}, ${Math.min(avgG + 20, 255)}, ${avgB}, 0.2)`,
    tertiary: `rgba(${avgR}, ${avgG}, ${Math.min(avgB + 40, 255)}, 0.15)`,
  };

  const avgRgb: [number, number, number] = [avgR, avgG, avgB];
  const best = buckets.reduce((a, b) => (b.weight > a.weight ? b : a), buckets[0]);
  if (best.weight === 0) return { albumColors, accent: null, avgRgb };

  const accentR = Math.round(best.sumR / best.weight);
  const accentG = Math.round(best.sumG / best.weight);
  const accentB = Math.round(best.sumB / best.weight);

  return { albumColors, accent: extractAccent(accentR, accentG, accentB), avgRgb };
}
