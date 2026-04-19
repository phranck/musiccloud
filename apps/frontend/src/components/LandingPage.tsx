import type { NavItem } from "@musiccloud/shared";
import { ENDPOINTS } from "@musiccloud/shared";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { HeroInput } from "@/components/input/HeroInput";
import { AppFooter } from "@/components/layout/AppFooter";
import { PageHeader } from "@/components/layout/PageHeader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LogoView } from "@/components/ui/LogoView";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAppState } from "@/hooks/useAppState";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { useToast } from "@/hooks/useToast";
import { LocaleProvider, useT } from "@/i18n/context";
import { buildActiveConfig } from "@/lib/resolve/parsers";
import type { InputState } from "@/lib/types/app";
import { hexToRgb } from "@/lib/ui/colors";

// Lazy-loaded panels — only pulled into the bundle when the user needs them.
// Fallback is `null` because each is only rendered behind a visibility flag anyway.
const DisambiguationPanel = lazy(() =>
  import("@/components/panels/DisambiguationPanel").then((m) => ({ default: m.DisambiguationPanel })),
);
const GenreBrowseGrid = lazy(() =>
  import("@/components/panels/GenreBrowseGrid").then((m) => ({ default: m.GenreBrowseGrid })),
);
const GenreSearchResults = lazy(() =>
  import("@/components/panels/GenreSearchResults").then((m) => ({ default: m.GenreSearchResults })),
);
const InfoPanel = lazy(() => import("@/components/panels/InfoPanel").then((m) => ({ default: m.InfoPanel })));
const ShareLayout = lazy(() => import("@/components/share/ShareLayout").then((m) => ({ default: m.ShareLayout })));
const Toast = lazy(() => import("@/components/ui/Toast").then((m) => ({ default: m.Toast })));
const PlatformIconRow = lazy(() =>
  import("@/components/platform/PlatformIconRow").then((m) => ({ default: m.PlatformIconRow })),
);

const EMPTY_NAV_ITEMS: NavItem[] = [];

function LandingPageInner({
  headerNav = EMPTY_NAV_ITEMS,
  footerNav = EMPTY_NAV_ITEMS,
}: {
  headerNav?: NavItem[];
  footerNav?: NavItem[];
}) {
  const t = useT();

  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const { dynamicAccent, handleAlbumArtLoad, resetColors } = useAlbumColors();
  const {
    state,
    active,
    candidates,
    selectedCandidateId,
    genreBrowseGenres,
    genreSearchPayload,
    selectedGenreResultId,
    canGoBack,
    errorMessage,
    showCompact,
    isClearing,
    isDisambiguating,
    isGenreBrowsing,
    isGenreSearching,
    isGenreSearchLoading,
    handleSubmit,
    handleSelectCandidate,
    handleSelectGenreResult,
    handleBack,
    handleClear,
  } = useAppState(resetColors);
  const { isReturning, capturePosition, triggerReturn } = useFlipAnimation(searchFieldRef);

  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [exampleShortId, setExampleShortId] = useState<string | null>(null);

  useEffect(() => {
    fetch(ENDPOINTS.frontend.randomExample)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { shortId: string } | null) => {
        if (data?.shortId) setExampleShortId(data.shortId);
      })
      .catch(() => {});
  }, []);
  const toast = useToast();

  const baseInputState: InputState =
    isDisambiguating || isClearing || isGenreBrowsing || isGenreSearching
      ? "idle"
      : state.type === "result"
        ? "success"
        : (state.type as InputState);
  const inputState = baseInputState === "idle" && isFocused ? "focused" : baseInputState;

  // Sync input value when back-navigation restores a previous screen.
  useEffect(() => {
    if (state.type === "genre-search" || state.type === "genre-search_loading") {
      setInputValue(state.payload.query);
    } else if (state.type === "genre-browse") {
      setInputValue("genre:?");
    }
  }, [state]);

  const focusActive = state.type === "result" ? state.active : null;
  const focusCandidates = state.type === "disambiguation" ? state.candidates : null;
  const focusGenreResults = state.type === "genre-search" ? state.payload : null;
  const genreSearchRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusActive) resultsPanelRef.current?.focus();
  }, [focusActive]);
  useEffect(() => {
    if (focusCandidates) disambiguationRef.current?.focus();
  }, [focusCandidates]);
  useEffect(() => {
    if (focusGenreResults) genreSearchRef.current?.focus();
  }, [focusGenreResults]);

  const handleClearAnimationEnd = useCallback(() => {
    capturePosition();
    triggerReturn();
    setInputValue("");
    handleClear();
  }, [capturePosition, triggerReturn, handleClear]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showCompact) {
        e.preventDefault();
        setInputValue("");
        handleClear();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showCompact, handleClear]);

  const activeConfig = active ? buildActiveConfig(active, t, handleAlbumArtLoad) : null;

  return (
    <>
      <div
        className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative"
        style={
          dynamicAccent
            ? ({
                "--color-accent": dynamicAccent.base,
                "--color-accent-rgb": hexToRgb(dynamicAccent.base),
                "--color-accent-hover": dynamicAccent.hover,
                "--color-accent-glow": dynamicAccent.glow,
                "--color-accent-contrast": dynamicAccent.contrastText,
              } as React.CSSProperties)
            : undefined
        }
      >
        <PageHeader showInfoButton onInfoClick={() => setIsInfoOpen(true)} navItems={headerNav} />
        <Suspense fallback={null}>
          <InfoPanel isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
        </Suspense>

        <div className="flex-1 flex flex-col items-center justify-center w-full">
          {!active && !candidates && !genreBrowseGenres && !genreSearchPayload && (
            <div className={`flex justify-center mb-10 ${isReturning ? "animate-fade-in" : ""}`}>
              <LogoView className="w-80 sm:w-96 md:w-[28rem] h-auto" />
            </div>
          )}

          {showCompact && (
            <div className="mb-6">
              <LogoView className="w-56 h-auto" />
            </div>
          )}

          <div ref={searchFieldRef} className="w-full flex flex-col items-center">
            <HeroInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSubmit}
              onClear={() => {
                setInputValue("");
                handleClear();
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              state={inputState}
              compact={showCompact}
              songName={
                active ? (active.kind === "artist" ? active.name : `${active.title} - ${active.artist}`) : undefined
              }
              errorMessage={errorMessage}
            />
          </div>

          {!active && !candidates && !genreBrowseGenres && !genreSearchPayload && exampleShortId && (
            <p className="mt-4 text-sm text-text-secondary text-center">
              {t("landing.exampleTeaser")}{" "}
              <a
                href={`/${exampleShortId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-[var(--color-accent-hover)] transition-colors"
              >
                {t("landing.exampleLink")}
              </a>
            </p>
          )}

          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {active?.kind === "song" ? t("results.found", { title: active.title, artist: active.artist }) : ""}
          </div>

          {candidates && candidates.length > 0 && (
            <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
              <Suspense fallback={null}>
                <DisambiguationPanel
                  candidates={candidates}
                  onSelect={handleSelectCandidate}
                  onCancel={handleClear}
                  selectedId={selectedCandidateId}
                  loading={state.type === "disambiguation_loading"}
                />
              </Suspense>
            </div>
          )}

          {genreBrowseGenres && (
            <Suspense fallback={null}>
              <GenreBrowseGrid
                genres={genreBrowseGenres}
                onSelect={(name) => {
                  const query = `genre: ${name}`;
                  setInputValue(query);
                  handleSubmit(query);
                }}
              />
            </Suspense>
          )}

          {genreSearchPayload && (
            <Suspense fallback={null}>
              <GenreSearchResults
                ref={genreSearchRef}
                results={genreSearchPayload.results}
                queryDetails={genreSearchPayload.queryDetails}
                warnings={genreSearchPayload.warnings}
                onSelect={handleSelectGenreResult}
                onCancel={handleClear}
                onBack={canGoBack ? handleBack : undefined}
                selectedId={selectedGenreResultId}
                loading={isGenreSearchLoading}
              />
            </Suspense>
          )}

          {activeConfig && active && (
            <div
              ref={resultsPanelRef}
              tabIndex={-1}
              className={`outline-none w-full ${isClearing ? "animate-slide-out-down pointer-events-none" : ""}`}
              onAnimationEnd={isClearing ? handleClearAnimationEnd : undefined}
            >
              <div className="mt-6 sm:mt-8">
                <Suspense fallback={null}>
                  <ShareLayout
                    config={activeConfig}
                    artistName={active.kind === "artist" ? active.name : active.artist}
                    animated
                    onBack={canGoBack ? handleBack : undefined}
                    backLabel={canGoBack ? t("genreSearch.backToResults") : undefined}
                  />
                </Suspense>
              </div>
            </div>
          )}
        </div>

        {state.type === "idle" && (
          <Suspense fallback={null}>
            <div className={isReturning ? "animate-fade-in" : ""}>
              <PlatformIconRow />
            </div>
          </Suspense>
        )}

        <Suspense fallback={null}>
          <Toast
            message={toast.state.message}
            variant={toast.state.variant}
            visible={toast.state.visible}
            onDismiss={toast.dismiss}
          />
        </Suspense>
      </div>

      <AppFooter navItems={footerNav} />
    </>
  );
}

export function LandingPage({
  headerNav = EMPTY_NAV_ITEMS,
  footerNav = EMPTY_NAV_ITEMS,
}: {
  headerNav?: NavItem[];
  footerNav?: NavItem[];
} = {}) {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <LandingPageInner headerNav={headerNav} footerNav={footerNav} />
      </LocaleProvider>
    </ErrorBoundary>
  );
}
