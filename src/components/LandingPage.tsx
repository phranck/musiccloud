import { useCallback, useEffect, useRef, useState } from "react";
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

export function LandingPage() {
  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const [inputState, setInputState] = useState<InputState>("idle");
  const [result, setResult] = useState<SongResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [albumColors, setAlbumColors] = useState<AlbumColors | undefined>();
  const [highlightedPlatforms, setHighlightedPlatforms] = useState<Platform[]>(
    [],
  );
  const [candidates, setCandidates] = useState<DisambiguationCandidate[] | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error" | "info";
    visible: boolean;
  }>({ message: "", variant: "info", visible: false });

  useEffect(() => {
    if (result) resultsPanelRef.current?.focus();
  }, [result]);

  useEffect(() => {
    if (candidates) disambiguationRef.current?.focus();
  }, [candidates]);

  const handleResolveSuccess = useCallback((data: Record<string, unknown>) => {
    const platforms: SongResult["platforms"] = ((data.links as Array<Record<string, unknown>>) ?? [])
      .filter((link) => link.url)
      .map((link) => ({
        platform: link.service as Platform,
        url: link.url as string,
        displayName: link.displayName as string | undefined,
        matchMethod: link.matchMethod as "isrc" | "search" | "odesli" | "cache" | undefined,
      }));

    const track = data.track as Record<string, unknown>;
    setResult({
      title: track.title as string,
      artist: (track.artists as string[]).join(", "),
      album: track.albumName as string | undefined,
      albumArtUrl: (track.artworkUrl as string) || "",
      platforms,
      shareUrl: data.shortUrl as string,
    });

    setHighlightedPlatforms(platforms.map((p) => p.platform));
    setInputState("success");
  }, []);

  const handleSubmit = useCallback(async (url: string) => {
    setInputState("loading");
    setResult(null);
    setCandidates(null);
    setErrorMessage(undefined);
    setHighlightedPlatforms([]);

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

      // Disambiguation: multiple candidates returned
      if (data.status === "disambiguation" && Array.isArray(data.candidates)) {
        setCandidates(data.candidates);
        setInputState("idle");
        return;
      }

      handleResolveSuccess(data);
    } catch (err) {
      setInputState("error");
      let errorMessage = "Something went wrong. Please try again.";

      if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
        errorMessage = "Looks like you're offline. Check your connection and try again.";
      } else if (err instanceof Error) {
        if (err.name === "AbortError") {
          errorMessage = "This is taking longer than usual. Please try again.";
        } else {
          errorMessage = err.message;
        }
      }

      setErrorMessage(errorMessage);
    }
  }, [handleResolveSuccess]);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    setCandidates(null);
    setInputState("loading");

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
      handleResolveSuccess(data);
    } catch (err) {
      setInputState("error");
      let errorMessage = "Something went wrong. Please try again.";

      if (err instanceof Error) {
        errorMessage = err.name === "AbortError"
          ? "This is taking longer than usual. Please try again."
          : err.message;
      }

      setErrorMessage(errorMessage);
    }
  }, [handleResolveSuccess]);

  const handleClear = useCallback(() => {
    setInputState("idle");
    setResult(null);
    setCandidates(null);
    setErrorMessage(undefined);
    setAlbumColors(undefined);
    setHighlightedPlatforms([]);
  }, []);

  const handleAlbumArtLoad = useCallback((img: HTMLImageElement) => {
    // Color extraction from album art
    // Uses a canvas to sample the dominant color
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
      <h1 className="text-2xl font-bold text-text-primary mb-2">
        music.cloud
      </h1>

      {/* Tagline */}
      {!result && !candidates && (
        <p className="text-2xl md:text-3xl font-bold text-text-primary text-center mb-8">
          Paste a link or search by name.
          <br />
          <span className="bg-gradient-to-r from-white to-accent-hover bg-clip-text text-transparent">
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
          searching={inputState === "loading"}
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
