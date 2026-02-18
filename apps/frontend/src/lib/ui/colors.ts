/**
 * Album artwork color extraction utilities.
 * Extracts dominant and accent colors from album art for dynamic theming.
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
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
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

export function extractAccent(r: number, g: number, b: number): DynamicAccent | null {
  const [h, s] = rgbToHsl(r, g, b);
  if (s < 0.1) return null;
  const [ar, ag, ab] = hslToRgb(h, Math.max(s, 0.5), 0.55);
  const [hr, hg, hb] = hslToRgb(h, Math.max(s, 0.5), 0.65);
  const brightness = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  return {
    base: `rgb(${ar}, ${ag}, ${ab})`,
    hover: `rgb(${hr}, ${hg}, ${hb})`,
    glow: `rgba(${ar}, ${ag}, ${ab}, 0.25)`,
    contrastText: brightness > 0.55 ? "#000000" : "#ffffff",
  };
}

/**
 * Samples an HTMLImageElement via canvas and returns album colors + dynamic accent.
 * Must be called after the image has loaded (crossOrigin="anonymous" required).
 */
export function extractAlbumColors(img: HTMLImageElement): { albumColors: AlbumColors; accent: DynamicAccent | null } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      albumColors: { primary: "transparent", secondary: "transparent", tertiary: "transparent" },
      accent: null,
    };
  }

  const size = 20;
  canvas.width = size; canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const pixelCount = size * size;

  let totalR = 0, totalG = 0, totalB = 0;
  let bestR = 0, bestG = 0, bestB = 0, bestScore = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    totalR += r; totalG += g; totalB += b;
    const [, s, l] = rgbToHsl(r, g, b);
    const score = s * (0.7 + 0.3 * (1 - Math.abs(l - 0.5) * 2));
    if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
  }

  const avgR = Math.round(totalR / pixelCount);
  const avgG = Math.round(totalG / pixelCount);
  const avgB = Math.round(totalB / pixelCount);

  const albumColors: AlbumColors = {
    primary: `rgba(${avgR}, ${avgG}, ${avgB}, 0.25)`,
    secondary: `rgba(${Math.min(avgR + 40, 255)}, ${Math.min(avgG + 20, 255)}, ${avgB}, 0.2)`,
    tertiary: `rgba(${avgR}, ${avgG}, ${Math.min(avgB + 40, 255)}, 0.15)`,
  };

  return { albumColors, accent: extractAccent(bestR, bestG, bestB) };
}
