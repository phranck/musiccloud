import { useCallback, useEffect, useState } from "react";
import { type AlbumColors, type DynamicAccent, extractAlbumColors } from "@/lib/ui/colors";

interface UseAlbumColorsResult {
  albumColors: AlbumColors | undefined;
  dynamicAccent: DynamicAccent | undefined;
  handleAlbumArtLoad: (img: HTMLImageElement) => void;
  resetColors: () => void;
}

interface UseAlbumColorsOptions {
  mirrorRoot?: boolean;
}

const BG_VARS = ["--bg-blob-primary", "--bg-blob-secondary", "--bg-blob-tertiary"] as const;
const PARTICLE_VARS = ["--bg-particle-color", "--bg-particle-glow", "--bg-particle-halo"] as const;

function clearRootAmbientVars(root: HTMLElement) {
  for (const v of BG_VARS) root.style.removeProperty(v);
  for (const v of PARTICLE_VARS) root.style.removeProperty(v);
}

function particleVarsFromCloudColor(color: string): Record<(typeof PARTICLE_VARS)[number], string> | null {
  const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;

  const [, r, g, b] = match;
  return {
    "--bg-particle-color": `rgba(${r}, ${g}, ${b}, 0.92)`,
    "--bg-particle-glow": `rgba(${r}, ${g}, ${b}, 0.28)`,
    "--bg-particle-halo": `rgba(${r}, ${g}, ${b}, 0.12)`,
  };
}

/**
 * Extracts dominant colors from album art images and maps them to
 * dynamic accent CSS custom properties.
 *
 * Album colors are also mirrored onto `<html>` as CSS custom properties
 * so the background blobs — rendered as static Astro markup outside the
 * React tree — can react to them without re-rendering React.
 */
export function useAlbumColors({ mirrorRoot = true }: UseAlbumColorsOptions = {}): UseAlbumColorsResult {
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
  // and particles (Astro markup, no React) pick them up via CSS custom
  // property fallbacks. Cleanup is explicit because direct share pages unmount
  // ShareLayout without necessarily resetting this hook's state first.
  useEffect(() => {
    if (!mirrorRoot) return;

    const root = document.documentElement;
    if (albumColors) {
      root.style.setProperty("--bg-blob-primary", albumColors.primary);
      root.style.setProperty("--bg-blob-secondary", albumColors.secondary);
      root.style.setProperty("--bg-blob-tertiary", albumColors.tertiary);

      const particleVars = particleVarsFromCloudColor(albumColors.primary);
      if (particleVars) {
        for (const [name, value] of Object.entries(particleVars)) root.style.setProperty(name, value);
      } else {
        for (const v of PARTICLE_VARS) root.style.removeProperty(v);
      }
    } else {
      clearRootAmbientVars(root);
    }

    return () => clearRootAmbientVars(root);
  }, [albumColors, mirrorRoot]);

  return { albumColors, dynamicAccent, handleAlbumArtLoad, resetColors };
}
