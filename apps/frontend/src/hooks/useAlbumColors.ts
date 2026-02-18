import { useCallback, useState } from "react";
import { type AlbumColors, type DynamicAccent, extractAlbumColors } from "@/lib/ui/colors";

interface UseAlbumColorsResult {
  albumColors: AlbumColors | undefined;
  dynamicAccent: DynamicAccent | undefined;
  handleAlbumArtLoad: (img: HTMLImageElement) => void;
  resetColors: () => void;
}

/**
 * Extracts dominant colors from album art images and maps them to
 * dynamic accent CSS custom properties.
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

  return { albumColors, dynamicAccent, handleAlbumArtLoad, resetColors };
}
