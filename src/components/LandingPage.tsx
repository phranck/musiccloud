import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Platform } from "../lib/utils";
import { DisambiguationPanel, type DisambiguationCandidate } from "./DisambiguationPanel";
import { GradientBackground } from "./GradientBackground";
import { HeroInput, type InputState } from "./HeroInput";
import { PlatformIconRow } from "./PlatformIconRow";
import { ResultsPanel, type SongResult } from "./ResultsPanel";
import { SparklingStars } from "./SparklingStars";
import { Toast } from "./Toast";

interface AlbumColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

interface DynamicAccent {
  base: string;
  hover: string;
  glow: string;
  contrastText: string;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

function extractAccent(r: number, g: number, b: number): DynamicAccent | null {
  const [h, s] = rgbToHsl(r, g, b);
  // Skip near-gray colors (low saturation)
  if (s < 0.1) return null;
  // Normalize: ensure vibrant saturation and consistent lightness
  const [ar, ag, ab] = hslToRgb(h, Math.max(s, 0.5), 0.55);
  const [hr, hg, hb] = hslToRgb(h, Math.max(s, 0.5), 0.65);
  // WCAG perceived brightness to pick contrast text color
  const brightness = (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255;
  const contrastText = brightness > 0.55 ? "#000000" : "#ffffff";
  return {
    base: `rgb(${ar}, ${ag}, ${ab})`,
    hover: `rgb(${hr}, ${hg}, ${hb})`,
    glow: `rgba(${ar}, ${ag}, ${ab}, 0.25)`,
    contrastText,
  };
}

// Discriminated union: each state variant only carries the data it needs.
// Invalid combinations (e.g. success without result) are impossible by construction.
type AppState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "clearing"; result: SongResult }
  | { type: "error"; message: string }
  | { type: "disambiguation"; candidates: DisambiguationCandidate[] }
  | { type: "disambiguation_loading"; candidates: DisambiguationCandidate[]; selectedId: string };

type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "SELECT_CANDIDATE"; selectedId: string }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_START" }
  | { type: "CLEAR" };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SUBMIT":
      return { type: "loading" };
    case "RESOLVE_SUCCESS":
      return { type: "success", result: action.result, highlightedPlatforms: action.highlightedPlatforms };
    case "DISAMBIGUATION":
      return { type: "disambiguation", candidates: action.candidates };
    case "SELECT_CANDIDATE":
      if (state.type === "disambiguation") {
        return { type: "disambiguation_loading", candidates: state.candidates, selectedId: action.selectedId };
      }
      return state;
    case "ERROR":
      return { type: "error", message: action.message };
    case "CLEAR_START":
      if (state.type === "success") {
        return { type: "clearing", result: state.result };
      }
      return { type: "idle" };
    case "CLEAR":
      return { type: "idle" };
  }
}

function parseResolveResponse(data: Record<string, unknown>): { result: SongResult; highlightedPlatforms: Platform[] } {
  const platforms: SongResult["platforms"] = ((data.links as Array<Record<string, unknown>>) ?? [])
    .filter((link) => link.url)
    .map((link) => ({
      platform: link.service as Platform,
      url: link.url as string,
      displayName: link.displayName as string | undefined,
      matchMethod: link.matchMethod as "isrc" | "search" | "odesli" | "cache" | undefined,
    }));

  const track = data.track as Record<string, unknown>;
  const result: SongResult = {
    title: track.title as string,
    artist: (track.artists as string[]).join(", "),
    album: track.albumName as string | undefined,
    releaseDate: track.releaseDate as string | undefined,
    albumArtUrl: (track.artworkUrl as string) || "",
    platforms,
    shareUrl: data.shortUrl as string,
  };

  return { result, highlightedPlatforms: platforms.map((p) => p.platform) };
}

function parseErrorMessage(err: unknown): string {
  if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
    return "Looks like you're offline. Check your connection and try again.";
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return "This is taking longer than usual. Please try again.";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export function LandingPage() {
  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);

  const [state, dispatch] = useReducer(appReducer, { type: "idle" });

  // Independent state: albumColors, dynamicAccent and toast don't participate in the state machine
  const [albumColors, setAlbumColors] = useState<AlbumColors | undefined>();
  const [dynamicAccent, setDynamicAccent] = useState<DynamicAccent | undefined>();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", variant: "info", visible: false });

  // Derive values from discriminated state
  const isDisambiguating = state.type === "disambiguation" || state.type === "disambiguation_loading";
  const isClearing = state.type === "clearing";
  const inputState: InputState = isDisambiguating || isClearing ? "idle" : state.type;
  const result = state.type === "success" ? state.result : state.type === "clearing" ? state.result : null;
  const candidates = isDisambiguating ? state.candidates : null;
  const selectedCandidateId = state.type === "disambiguation_loading" ? state.selectedId : null;
  const errorMessage = state.type === "error" ? state.message : undefined;
  const highlightedPlatforms = state.type === "success" ? state.highlightedPlatforms : [];
  // During clearing: keep compact layout stable so nothing jumps. Switch to idle layout after animation ends.
  const showCompact = !!(result || candidates);

  // Focus management
  useEffect(() => {
    if (state.type === "success") resultsPanelRef.current?.focus();
  }, [state.type === "success" && state.result]);

  useEffect(() => {
    if (state.type === "disambiguation") disambiguationRef.current?.focus();
  }, [state.type === "disambiguation" && state.candidates]);

  const handleSubmit = useCallback(async (url: string) => {
    dispatch({ type: "SUBMIT" });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: url }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || "Something went wrong. Please try again.");
      }

      const data = await response.json();

      if (data.status === "disambiguation" && Array.isArray(data.candidates)) {
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
        return;
      }

      const { result, highlightedPlatforms } = parseResolveResponse(data);
      dispatch({ type: "RESOLVE_SUCCESS", result, highlightedPlatforms });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorMessage(err) });
    }
  }, []);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCandidate: candidate.id }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || "Something went wrong. Please try again.");
      }

      const data = await response.json();
      const { result, highlightedPlatforms } = parseResolveResponse(data);
      dispatch({ type: "RESOLVE_SUCCESS", result, highlightedPlatforms });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorMessage(err) });
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
    setAlbumColors(undefined);
    setDynamicAccent(undefined);
  }, []);

  const handleClearAnimationEnd = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  const handleAlbumArtLoad = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Sample at 20x20 for reliable color extraction
      const size = 20;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const data = ctx.getImageData(0, 0, size, size).data;
      const pixelCount = size * size;

      let totalR = 0, totalG = 0, totalB = 0;
      let bestR = 0, bestG = 0, bestB = 0;
      let bestScore = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        totalR += r;
        totalG += g;
        totalB += b;

        // Score: prefer saturated colors at mid-range lightness
        const [, s, l] = rgbToHsl(r, g, b);
        const lightnessBonus = 1 - Math.abs(l - 0.5) * 2;
        const score = s * (0.7 + 0.3 * lightnessBonus);
        if (score > bestScore) {
          bestScore = score;
          bestR = r;
          bestG = g;
          bestB = b;
        }
      }

      // Average color for gradient background
      const avgR = Math.round(totalR / pixelCount);
      const avgG = Math.round(totalG / pixelCount);
      const avgB = Math.round(totalB / pixelCount);

      const dominant = `rgba(${avgR}, ${avgG}, ${avgB}, 0.25)`;
      const secondary = `rgba(${Math.min(avgR + 40, 255)}, ${Math.min(avgG + 20, 255)}, ${avgB}, 0.2)`;
      const tertiary = `rgba(${avgR}, ${avgG}, ${Math.min(avgB + 40, 255)}, 0.15)`;
      setAlbumColors({ primary: dominant, secondary, tertiary });

      // Most vibrant pixel for accent color
      const accent = extractAccent(bestR, bestG, bestB);
      if (import.meta.env.DEV) console.log("[AlbumArt] avg:", avgR, avgG, avgB, "vibrant:", bestR, bestG, bestB, "accent:", accent);
      setDynamicAccent(accent ?? undefined);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[AlbumArt] Color extraction failed:", err);
    }
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 pb-24 transition-colors duration-700"
      style={dynamicAccent ? {
        "--color-accent": dynamicAccent.base,
        "--color-accent-hover": dynamicAccent.hover,
        "--color-accent-glow": dynamicAccent.glow,
        "--color-accent-contrast": dynamicAccent.contrastText,
      } as React.CSSProperties : undefined}
    >
      <GradientBackground albumColors={albumColors} />
      <SparklingStars />

      {/* Hero */}
      {!result && !candidates && (
        <div className="text-center mb-10">
          <h1 className="text-5xl md:text-6xl font-bold tracking-[-0.04em] text-text-primary mb-2">
            music.cloud
          </h1>
          <p className="text-xl md:text-2xl font-medium tracking-[-0.02em] text-text-secondary">
            share it everywhere
          </p>
        </div>
      )}

      {/* Compact logo when results/disambiguation shown (not during clearing) */}
      {showCompact && (
        <h1 className="text-3xl font-bold tracking-[-0.04em] text-text-primary mb-6">
          music.cloud
        </h1>
      )}

      {/* Hero Input */}
      <div className="w-full flex flex-col items-center">
        <HeroInput
          onSubmit={handleSubmit}
          onClear={handleClear}
          state={inputState}
          compact={showCompact}
          songName={
            state.type === "success" ? `${state.result.title} - ${state.result.artist}` : undefined
          }
          errorMessage={errorMessage}
        />
      </div>

      {/* Disambiguation */}
      {candidates && candidates.length > 0 && (
        <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
          <DisambiguationPanel
            candidates={candidates}
            onSelect={handleSelectCandidate}
            onCancel={handleClear}
            selectedId={selectedCandidateId}
            loading={state.type === "disambiguation_loading"}
          />
        </div>
      )}

      {/* Results */}
      {result && (
        <div
          ref={resultsPanelRef}
          tabIndex={-1}
          className={`outline-none w-full flex justify-center ${isClearing ? "animate-slide-out-down pointer-events-none" : ""}`}
          onAnimationEnd={isClearing ? handleClearAnimationEnd : undefined}
        >
          <ResultsPanel result={result} onAlbumArtLoad={handleAlbumArtLoad} />
        </div>
      )}

      {/* Platform marquee (idle state only, not during clearing) */}
      {state.type === "idle" && <PlatformIconRow />}

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-6 py-3 text-xs text-text-muted">
        <span>&copy; 2026 music.cloud</span>
        <span>
          made by{" "}
          <a
            href="https://layered.world"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-secondary transition-colors duration-150"
          >
            LAYERED
          </a>
        </span>
      </footer>

      {/* Toast */}
      <Toast
        message={toast.message}
        variant={toast.variant}
        visible={toast.visible}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </div>
  );
}
