import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { FaCircleInfo } from "react-icons/fa6";
import { LocaleProvider, useT } from "../i18n/context";
import type { ResolveDisambiguationResponse, ResolveErrorResponse, ResolveSuccessResponse } from "../lib/api-types";
import { isValidPlatform, type Platform } from "../lib/utils";
import { BrandName } from "./BrandName";
import { type DisambiguationCandidate, DisambiguationPanel } from "./DisambiguationPanel";
import { GradientBackground } from "./GradientBackground";
import { HeroInput, type InputState } from "./HeroInput";
import { InfoPanel } from "./InfoPanel";
import { LanguageSwitcher } from "./LanguageSwitcher";
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
    case "SUBMIT": return { type: "loading" };
    case "RESOLVE_SUCCESS": return { type: "success", result: action.result, highlightedPlatforms: action.highlightedPlatforms };
    case "DISAMBIGUATION": return { type: "disambiguation", candidates: action.candidates };
    case "SELECT_CANDIDATE":
      if (state.type === "disambiguation") return { type: "disambiguation_loading", candidates: state.candidates, selectedId: action.selectedId };
      return state;
    case "ERROR": return { type: "error", message: action.message };
    case "CLEAR_START":
      if (state.type === "success") return { type: "clearing", result: state.result };
      return { type: "idle" };
    case "CLEAR": return { type: "idle" };
  }
}

function parseResolveResponse(data: ResolveSuccessResponse): { result: SongResult; highlightedPlatforms: Platform[] } {
  const platforms: SongResult["platforms"] = data.links
    .filter((link) => link.url && isValidPlatform(link.service))
    .map((link) => ({
      platform: link.service as Platform,
      url: link.url,
      displayName: link.displayName,
      matchMethod: link.matchMethod,
    }));
  const result: SongResult = {
    title: data.track.title,
    artist: data.track.artists.join(", "),
    album: data.track.albumName,
    releaseDate: data.track.releaseDate,
    durationMs: data.track.durationMs,
    isrc: data.track.isrc,
    isExplicit: data.track.isExplicit,
    albumArtUrl: data.track.artworkUrl ?? "",
    platforms,
    shareUrl: data.shortUrl,
  };
  return { result, highlightedPlatforms: platforms.map((p) => p.platform) };
}

// Returns a translation key instead of a hardcoded English string
function parseErrorKey(err: unknown): string {
  if (err instanceof TypeError && err.message.includes("Failed to fetch")) return "error.offline";
  if (err instanceof Error && err.name === "AbortError") return "error.timeout";
  return "error.generic";
}

function LandingPageInner() {
  const t = useT();

  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const prevSearchY = useRef<number | null>(null);

  const [state, dispatch] = useReducer(appReducer, { type: "idle" });
  const [isFocused, setIsFocused] = useState(false);
  const [albumColors, setAlbumColors] = useState<AlbumColors | undefined>();
  const [dynamicAccent, setDynamicAccent] = useState<DynamicAccent | undefined>();
  const [isReturning, setIsReturning] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" | "info"; visible: boolean }>(
    { message: "", variant: "info", visible: false }
  );

  const isDisambiguating = state.type === "disambiguation" || state.type === "disambiguation_loading";
  const isClearing = state.type === "clearing";
  const baseInputState: InputState = isDisambiguating || isClearing ? "idle" : state.type;
  const inputState: InputState = baseInputState === "idle" && isFocused ? "focused" : baseInputState;
  const result = state.type === "success" ? state.result : state.type === "clearing" ? state.result : null;
  const candidates = isDisambiguating ? state.candidates : null;
  const selectedCandidateId = state.type === "disambiguation_loading" ? state.selectedId : null;
  const errorMessage = state.type === "error" ? t(state.message) : undefined;
  const showCompact = !!(result || candidates);

  const focusResult = state.type === "success" ? state.result : null;
  const focusCandidates = state.type === "disambiguation" ? state.candidates : null;
  useEffect(() => { if (focusResult) resultsPanelRef.current?.focus(); }, [focusResult]);
  useEffect(() => { if (focusCandidates) disambiguationRef.current?.focus(); }, [focusCandidates]);

  const handleToastDismiss = useCallback(() => setToast((p) => ({ ...p, visible: false })), []);

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
        const errorData = (await response.json().catch(() => ({}))) as Partial<ResolveErrorResponse>;
        throw new Error(errorData.message || "error.generic");
      }
      const data = (await response.json()) as ResolveSuccessResponse | ResolveDisambiguationResponse;
      if ("status" in data && data.status === "disambiguation") {
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
        return;
      }
      const { result, highlightedPlatforms } = parseResolveResponse(data as ResolveSuccessResponse);
      dispatch({ type: "RESOLVE_SUCCESS", result, highlightedPlatforms });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
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
        const errorData = (await response.json().catch(() => ({}))) as Partial<ResolveErrorResponse>;
        throw new Error(errorData.message || "error.generic");
      }
      const data = (await response.json()) as ResolveSuccessResponse;
      const { result, highlightedPlatforms } = parseResolveResponse(data);
      dispatch({ type: "RESOLVE_SUCCESS", result, highlightedPlatforms });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
    setAlbumColors(undefined);
    setDynamicAccent(undefined);
  }, []);

  const handleClearAnimationEnd = useCallback(() => {
    if (searchFieldRef.current) prevSearchY.current = searchFieldRef.current.getBoundingClientRect().top;
    setIsReturning(true);
    dispatch({ type: "CLEAR" });
  }, []);

  useLayoutEffect(() => {
    if (!isReturning || prevSearchY.current === null || !searchFieldRef.current) return;
    const el = searchFieldRef.current;
    const newY = el.getBoundingClientRect().top;
    const delta = prevSearchY.current - newY;
    prevSearchY.current = null;
    if (Math.abs(delta) < 2) { setIsReturning(false); return; }
    el.style.transform = `translateY(${delta}px)`;
    el.style.transition = "none";
    el.offsetHeight;
    el.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = "";
    const cleanup = () => { el.style.transition = ""; el.removeEventListener("transitionend", cleanup); setIsReturning(false); };
    el.addEventListener("transitionend", cleanup);
  }, [isReturning]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showCompact) { e.preventDefault(); handleClear(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCompact, handleClear]);

  const handleAlbumArtLoad = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = 20;
      canvas.width = size; canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const pixelCount = size * size;
      let totalR = 0, totalG = 0, totalB = 0, bestR = 0, bestG = 0, bestB = 0, bestScore = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        totalR += r; totalG += g; totalB += b;
        const [, s, l] = rgbToHsl(r, g, b);
        const score = s * (0.7 + 0.3 * (1 - Math.abs(l - 0.5) * 2));
        if (score > bestScore) { bestScore = score; bestR = r; bestG = g; bestB = b; }
      }
      const avgR = Math.round(totalR / pixelCount);
      const avgG = Math.round(totalG / pixelCount);
      const avgB = Math.round(totalB / pixelCount);
      setAlbumColors({
        primary: `rgba(${avgR}, ${avgG}, ${avgB}, 0.25)`,
        secondary: `rgba(${Math.min(avgR+40,255)}, ${Math.min(avgG+20,255)}, ${avgB}, 0.2)`,
        tertiary: `rgba(${avgR}, ${avgG}, ${Math.min(avgB+40,255)}, 0.15)`,
      });
      const accent = extractAccent(bestR, bestG, bestB);
      if (import.meta.env.DEV) console.log("[AlbumArt] accent:", accent);
      setDynamicAccent(accent ?? undefined);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[AlbumArt] Color extraction failed:", err);
    }
  }, []);

  return (
    <div
      className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative"
      style={
        dynamicAccent
          ? ({
              "--color-accent": dynamicAccent.base,
              "--color-accent-hover": dynamicAccent.hover,
              "--color-accent-glow": dynamicAccent.glow,
              "--color-accent-contrast": dynamicAccent.contrastText,
            } as React.CSSProperties)
          : undefined
      }
    >
      <GradientBackground albumColors={albumColors} />
      <SparklingStars />

      {/* Language switcher + Info button — fixed top-right */}
      <div className="fixed top-4 right-4 z-40 flex items-center gap-1">
        <LanguageSwitcher />
        <button
          onClick={() => setIsInfoOpen(true)}
          aria-label={t("a11y.infoButton")}
          className="p-2 text-white/30 hover:text-white/70 transition-colors duration-150 rounded-lg focus:outline-none"
        >
          <FaCircleInfo className="w-5 h-5" />
        </button>
      </div>

      <InfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        {!result && !candidates && (
          <div className={`flex justify-center mb-10 ${isReturning ? "animate-fade-in" : ""}`}>
            <div className="text-center">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.04em] text-text-primary mb-1">
                <BrandName />
              </h1>
              <p
                className="text-sm sm:text-base md:text-lg font-light tracking-[-0.02em] text-white/70 -mt-1"
                style={{ fontFamily: '"Nasalization", sans-serif' }}
              >
                share it everywhere
              </p>
            </div>
          </div>
        )}

        {showCompact && (
          <h1 className="text-3xl font-bold tracking-[-0.04em] text-text-primary mb-6">
            <BrandName />
          </h1>
        )}

        <div ref={searchFieldRef} className="w-full flex flex-col items-center">
          <HeroInput
            onSubmit={handleSubmit}
            onClear={handleClear}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            state={inputState}
            compact={showCompact}
            songName={state.type === "success" ? `${state.result.title} - ${state.result.artist}` : undefined}
            errorMessage={errorMessage}
          />
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {result ? t("results.found", { title: result.title, artist: result.artist }) : ""}
        </div>

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

        {state.type === "idle" && (
          <div className={isReturning ? "animate-fade-in" : ""}>
            <PlatformIconRow />
          </div>
        )}
      </div>

      <Toast message={toast.message} variant={toast.variant} visible={toast.visible} onDismiss={handleToastDismiss} />
    </div>
  );
}

export function LandingPage() {
  return (
    <LocaleProvider>
      <LandingPageInner />
    </LocaleProvider>
  );
}
