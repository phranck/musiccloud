import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Platform } from "../lib/utils";
import { DisambiguationPanel, type DisambiguationCandidate } from "./DisambiguationPanel";
import { GradientBackground } from "./GradientBackground";
import { HeroInput, type InputState } from "./HeroInput";
import { PlatformIconRow } from "./PlatformIconRow";
import { ResultsPanel, type SongResult } from "./ResultsPanel";
import { Toast } from "./Toast";

interface AlbumColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

// Discriminated union: each state variant only carries the data it needs.
// Invalid combinations (e.g. success without result) are impossible by construction.
type AppState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "error"; message: string }
  | { type: "disambiguation"; candidates: DisambiguationCandidate[] };

type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR" };

function appReducer(_state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SUBMIT":
      return { type: "loading" };
    case "RESOLVE_SUCCESS":
      return { type: "success", result: action.result, highlightedPlatforms: action.highlightedPlatforms };
    case "DISAMBIGUATION":
      return { type: "disambiguation", candidates: action.candidates };
    case "ERROR":
      return { type: "error", message: action.message };
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

  // Independent state: albumColors and toast don't participate in the state machine
  const [albumColors, setAlbumColors] = useState<AlbumColors | undefined>();
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", variant: "info", visible: false });

  // Derive values from discriminated state
  const inputState: InputState = state.type === "disambiguation" ? "idle" : state.type;
  const result = state.type === "success" ? state.result : null;
  const candidates = state.type === "disambiguation" ? state.candidates : null;
  const errorMessage = state.type === "error" ? state.message : undefined;
  const highlightedPlatforms = state.type === "success" ? state.highlightedPlatforms : [];

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
    dispatch({ type: "SUBMIT" });

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
    dispatch({ type: "CLEAR" });
    setAlbumColors(undefined);
  }, []);

  const handleAlbumArtLoad = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 1;
      canvas.height = 1;
      ctx.drawImage(img, 0, 0, 1, 1);

      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const dominant = `rgba(${r}, ${g}, ${b}, 0.25)`;
      const secondary = `rgba(${Math.min(r + 40, 255)}, ${Math.min(g + 20, 255)}, ${b}, 0.2)`;
      const tertiary = `rgba(${r}, ${g}, ${Math.min(b + 40, 255)}, 0.15)`;

      setAlbumColors({ primary: dominant, secondary, tertiary });
    } catch {
      // CORS or other error - keep default colors
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <GradientBackground albumColors={albumColors} />

      {/* Logo */}
      <h1 className="text-3xl font-bold tracking-[-0.04em] text-text-primary mb-3">
        music.cloud
      </h1>

      {/* Tagline */}
      {!result && !candidates && (
        <p className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-text-primary text-center mb-12">
          Paste a link or search by name.
          <br />
          <span className="text-text-secondary">
            Share it everywhere.
          </span>
        </p>
      )}

      {/* Hero Input */}
      <div className="w-full flex justify-center">
        <HeroInput
          onSubmit={handleSubmit}
          onClear={handleClear}
          state={inputState}
          songName={
            result ? `${result.title} - ${result.artist}` : undefined
          }
          errorMessage={errorMessage}
        />
      </div>

      {/* Platform Icons (hide when results or disambiguation shown) */}
      {!result && !candidates && (
        <PlatformIconRow
          highlightedPlatforms={highlightedPlatforms}
          searching={state.type === "loading"}
        />
      )}

      {/* Disambiguation */}
      {candidates && candidates.length > 0 && (
        <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
          <DisambiguationPanel
            candidates={candidates}
            onSelect={handleSelectCandidate}
            onCancel={handleClear}
          />
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultsPanelRef} tabIndex={-1} className="outline-none w-full flex justify-center">
          <ResultsPanel result={result} onAlbumArtLoad={handleAlbumArtLoad} />
        </div>
      )}

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
