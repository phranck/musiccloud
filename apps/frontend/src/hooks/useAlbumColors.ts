import { useCallback, useEffect, useState } from "react";
import { type AlbumColors, type DynamicAccent, extractAlbumColors } from "@/lib/ui/colors";

interface UseAlbumColorsResult {
  albumColors: AlbumColors | undefined;
  dynamicAccent: DynamicAccent | undefined;
  handleAlbumArtLoad: (img: HTMLImageElement) => void;
  resetColors: () => void;
}

const BG_VARS = ["--bg-blob-primary", "--bg-blob-secondary", "--bg-blob-tertiary"] as const;

/**
 * Extracts dominant colors from album art images and maps them to
 * dynamic accent CSS custom properties.
 *
 * Album colors are also mirrored onto `<html>` as CSS custom properties
 * so the background blobs — rendered as static Astro markup outside the
 * React tree — can react to them without re-rendering React.
 */
export function useAlbumColors(): UseAlbumColorsResult {
  const [albumColors, setAlbumColors] = useState<AlbumColors | undefined>();
  const [dynamicAccent, setDynamicAccent] = useState<DynamicAccent | undefined>();

  const handleAlbumArtLoad = useCallback((img: HTMLImageElement) => {
    try {
      const { albumColors: colors, accent } = extractAlbumColors(img);
      setAlbumColors(colors);
      if (import.meta.env.DEV) console.log("[AlbumArt] accent:", accent);
      setDynamicAccent(accent ?? undefined);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[AlbumArt] Color extraction failed:", err);
    }
  }, []);

  const resetColors = useCallback(() => {
    setAlbumColors(undefined);
    setDynamicAccent(undefined);
  }, []);

  // Mirror album colors onto the document root so the static background blobs
  // (Astro markup, no React) pick them up via CSS custom property fallbacks.
  useEffect(() => {
    const root = document.documentElement;
    if (albumColors) {
      root.style.setProperty("--bg-blob-primary", albumColors.primary);
      root.style.setProperty("--bg-blob-secondary", albumColors.secondary);
      root.style.setProperty("--bg-blob-tertiary", albumColors.tertiary);
    } else {
      for (const v of BG_VARS) root.style.removeProperty(v);
    }
  }, [albumColors]);

  return { albumColors, dynamicAccent, handleAlbumArtLoad, resetColors };
}
