import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { LocaleProvider, useT } from "../i18n/context";
import type { AlbumResolveSuccessResponse, ResolveDisambiguationResponse, ResolveErrorResponse, ResolveSuccessResponse } from "../lib/api-types";
import { type AlbumColors, type DynamicAccent, extractAlbumColors } from "../lib/colors";
import { isAlbumUrl, isValidPlatform, type Platform } from "../lib/utils";
import { AlbumResultsPanel, type AlbumResult } from "./AlbumResultsPanel";
import { AppFooter } from "./AppFooter";
import { BrandName } from "./BrandName";
import { type DisambiguationCandidate, DisambiguationPanel } from "./DisambiguationPanel";
import { GradientBackground } from "./GradientBackground";
import { HeroSection } from "./HeroSection";
import { HeroInput, type InputState } from "./HeroInput";
import { InfoPanel } from "./InfoPanel";
import { PageHeader } from "./PageHeader";
import { PlatformIconRow } from "./PlatformIconRow";
import { ResultsPanel, type SongResult } from "./ResultsPanel";
import { SparklingStars } from "./SparklingStars";
import { Toast } from "./Toast";

type AppState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "album_success"; result: AlbumResult }
  | { type: "clearing"; result: SongResult }
  | { type: "clearing_album"; result: AlbumResult }
  | { type: "error"; message: string }
  | { type: "disambiguation"; candidates: DisambiguationCandidate[] }
  | { type: "disambiguation_loading"; candidates: DisambiguationCandidate[]; selectedId: string };

type AppAction =
  | { type: "SUBMIT" }
  | { type: "RESOLVE_SUCCESS"; result: SongResult; highlightedPlatforms: Platform[] }
  | { type: "ALBUM_SUCCESS"; result: AlbumResult }
  | { type: "DISAMBIGUATION"; candidates: DisambiguationCandidate[] }
  | { type: "SELECT_CANDIDATE"; selectedId: string }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_START" }
  | { type: "CLEAR" };

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SUBMIT": return { type: "loading" };
    case "RESOLVE_SUCCESS": return { type: "success", result: action.result, highlightedPlatforms: action.highlightedPlatforms };
    case "ALBUM_SUCCESS": return { type: "album_success", result: action.result };
    case "DISAMBIGUATION": return { type: "disambiguation", candidates: action.candidates };
    case "SELECT_CANDIDATE":
      if (state.type === "disambiguation") return { type: "disambiguation_loading", candidates: state.candidates, selectedId: action.selectedId };
      return state;
    case "ERROR": return { type: "error", message: action.message };
    case "CLEAR_START":
      if (state.type === "success") return { type: "clearing", result: state.result };
      if (state.type === "album_success") return { type: "clearing_album", result: state.result };
      return { type: "idle" };
    case "CLEAR": return { type: "idle" };
  }
}

function parseAlbumResolveResponse(data: AlbumResolveSuccessResponse): AlbumResult {
  const platforms = data.links
    .filter((link) => link.url && isValidPlatform(link.service))
    .map((link) => ({
      platform: link.service as Platform,
      url: link.url,
      displayName: link.displayName,
      matchMethod: link.matchMethod,
    }));
  return {
    title: data.album.title,
    artist: data.album.artists.join(", "),
    releaseDate: data.album.releaseDate,
    totalTracks: data.album.totalTracks,
    artworkUrl: data.album.artworkUrl ?? "",
    label: data.album.label,
    upc: data.album.upc,
    platforms,
    shareUrl: data.shortUrl,
  };
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
  const isClearing = state.type === "clearing" || state.type === "clearing_album";
  const baseInputState: InputState = isDisambiguating || isClearing ? "idle" : state.type === "album_success" ? "success" : state.type;
  const inputState: InputState = baseInputState === "idle" && isFocused ? "focused" : baseInputState;
  const result = state.type === "success" ? state.result : state.type === "clearing" ? state.result : null;
  const albumResult = state.type === "album_success" ? state.result : state.type === "clearing_album" ? state.result : null;
  const candidates = isDisambiguating ? state.candidates : null;
  const selectedCandidateId = state.type === "disambiguation_loading" ? state.selectedId : null;
  const errorMessage = state.type === "error" ? t(state.message) : undefined;
  const showCompact = !!(result || albumResult || candidates);

  const focusResult = state.type === "success" || state.type === "album_success" ? state.result : null;
  const focusCandidates = state.type === "disambiguation" ? state.candidates : null;
  useEffect(() => { if (focusResult) resultsPanelRef.current?.focus(); }, [focusResult]);
  useEffect(() => { if (focusCandidates) disambiguationRef.current?.focus(); }, [focusCandidates]);

  const handleToastDismiss = useCallback(() => setToast((p) => ({ ...p, visible: false })), []);

  const handleSubmit = useCallback(async (url: string) => {
    dispatch({ type: "SUBMIT" });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const endpoint = isAlbumUrl(url) ? "/api/resolve-album" : "/api/resolve";
      const response = await fetch(endpoint, {
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
      if (endpoint === "/api/resolve-album") {
        const data = (await response.json()) as AlbumResolveSuccessResponse;
        dispatch({ type: "ALBUM_SUCCESS", result: parseAlbumResolveResponse(data) });
        return;
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
      const { albumColors, accent } = extractAlbumColors(img);
      setAlbumColors(albumColors);
      if (import.meta.env.DEV) console.log("[AlbumArt] accent:", accent);
      setDynamicAccent(accent ?? undefined);
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[AlbumArt] Color extraction failed:", err);
    }
  }, []);

  return (
    <>
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

        <PageHeader showInfoButton onInfoClick={() => setIsInfoOpen(true)} />
        <InfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />

        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {!result && !candidates && (
            <HeroSection className={isReturning ? "animate-fade-in" : ""} />
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
              songName={
                state.type === "success" ? `${state.result.title} - ${state.result.artist}` :
                state.type === "album_success" ? `${state.result.title} - ${state.result.artist}` :
                undefined
              }
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
              className={`outline-none w-full flex justify-center ${state.type === "clearing" ? "animate-slide-out-down pointer-events-none" : ""}`}
              onAnimationEnd={state.type === "clearing" ? handleClearAnimationEnd : undefined}
            >
              <ResultsPanel result={result} onAlbumArtLoad={handleAlbumArtLoad} />
            </div>
          )}

          {albumResult && (
            <div
              ref={resultsPanelRef}
              tabIndex={-1}
              className={`outline-none w-full flex justify-center ${state.type === "clearing_album" ? "animate-slide-out-down pointer-events-none" : ""}`}
              onAnimationEnd={state.type === "clearing_album" ? handleClearAnimationEnd : undefined}
            >
              <AlbumResultsPanel result={albumResult} onAlbumArtLoad={handleAlbumArtLoad} />
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

      <AppFooter />
    </>
  );
}

export function LandingPage() {
  return (
    <LocaleProvider>
      <LandingPageInner />
    </LocaleProvider>
  );
}
