import type { NavItem } from "@musiccloud/shared";
import {
  type AnimationEvent,
  lazy,
  type MouseEvent,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { HeroInput } from "@/components/landing/HeroInput";
import { LandingPageErrorAlert } from "@/components/landing/LandingPageErrorAlert";
import { AppFooter } from "@/components/layout/AppFooter";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LogoView } from "@/components/ui/LogoView";
import { DialogProvider } from "@/context/DialogContext";
import { useAppState } from "@/hooks/useAppState";
import { useFlipAnimation } from "@/hooks/useFlipAnimation";
import { useToast } from "@/hooks/useToast";
import { LocaleProvider, useT } from "@/i18n/context";
import { CardSignal, genreSignal, sendMusicSignal } from "@/lib/analytics/umami";
import {
  loadDisambiguationPanel,
  loadGenreBrowseGrid,
  loadGenreSearchResults,
  loadShareLayout,
  loadToast,
  preloadResolveResultRuntime,
} from "@/lib/preload/resultRuntime";
import { buildShareConfigFromActive } from "@/lib/resolve/parsers";
import { buildShareViewFromResolvedResponse, type ShareArtistInfoContext } from "@/lib/share/share-view";
import { ActiveResultKind, AppStateType, InputState } from "@/lib/types/app";
import type { ShareContentConfiguration } from "@/lib/types/media-card";

// Lazy-loaded panels — only pulled into the bundle when the user needs them.
// Fallback is `null` because each is only rendered behind a visibility flag anyway.
const DisambiguationPanel = lazy(loadDisambiguationPanel);
const GenreBrowseGrid = lazy(loadGenreBrowseGrid);
const GenreSearchResults = lazy(loadGenreSearchResults);
const ShareLayout = lazy(loadShareLayout);
const Toast = lazy(loadToast);

const EMPTY_NAV_ITEMS: NavItem[] = [];

interface LandingPageProps {
  exampleShortId?: string | null;
  footerNav?: NavItem[];
}

interface ActiveShareResultProps {
  activeArtistName: string;
  activeShareConfig: ShareContentConfiguration;
  artistInfoContext?: ShareArtistInfoContext;
  backLabel?: string;
  canGoBack: boolean;
  handleBack: () => void;
  handleClearAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
  handleShareLogoClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  isClearing: boolean;
  resultsPanelRef: RefObject<HTMLDivElement | null>;
}

function ActiveShareResult({
  activeArtistName,
  activeShareConfig,
  artistInfoContext,
  backLabel,
  canGoBack,
  handleBack,
  handleClearAnimationEnd,
  handleShareLogoClick,
  isClearing,
  resultsPanelRef,
}: ActiveShareResultProps) {
  return (
    <div
      ref={resultsPanelRef}
      tabIndex={-1}
      className={`outline-none w-full ${isClearing ? "animate-slide-out-down pointer-events-none" : ""}`}
      onAnimationEnd={isClearing ? handleClearAnimationEnd : undefined}
    >
      <div className="mb-4 text-center sm:mb-6">
        <a href="/" aria-label="Go to musiccloud home" className="inline-block" onClick={handleShareLogoClick}>
          <LogoView className="w-56 sm:w-64 h-auto" />
        </a>
      </div>
      <div className="animate-fade-in">
        <Suspense fallback={<ShareResultPlaceholder />}>
          <ShareLayout
            config={activeShareConfig}
            artistName={activeArtistName}
            artistInfoContext={artistInfoContext}
            onBack={canGoBack ? handleBack : undefined}
            backLabel={canGoBack ? backLabel : undefined}
          />
        </Suspense>
      </div>
    </div>
  );
}

function LiveExampleTeaser({
  exampleShortId,
  label,
  teaser,
  visible,
}: {
  exampleShortId: string;
  label: string;
  teaser: string;
  visible: boolean;
}) {
  return (
    <p
      className={`mt-4 min-h-5 text-sm text-text-secondary text-center transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      {teaser}{" "}
      <a
        href={`/${exampleShortId}`}
        onClick={() => sendMusicSignal(CardSignal.LiveExample)}
        className="text-accent hover:text-[var(--color-accent-hover)] transition-colors"
      >
        {label}
      </a>
    </p>
  );
}

function LandingLogoBlock({ isReturning, showCompact }: { isReturning: boolean; showCompact: boolean }) {
  if (showCompact) {
    return (
      <div className="mb-6">
        <LogoView className="w-56 h-auto" />
      </div>
    );
  }

  return (
    <div className={`flex justify-center mb-10 ${isReturning ? "animate-fade-in" : ""}`}>
      <LogoView className="w-80 sm:w-96 md:w-[28rem] h-auto" />
    </div>
  );
}

function ShareResultPlaceholder() {
  return (
    <div
      className="mx-auto w-full max-w-[512px] min-[1080px]:max-w-[1048px] opacity-0 pointer-events-none"
      aria-hidden="true"
    >
      <div className="hidden min-[1080px]:grid grid-cols-[512px_512px] gap-6">
        <div className="h-[560px]" />
        <div className="h-[560px]" />
      </div>
      <div className="min-[1080px]:hidden h-[520px]" />
    </div>
  );
}

function selectGenreTile(
  name: string,
  genres: import("@musiccloud/shared").ApiGenreTile[],
  setInputValue: (next: string) => void,
  handleSubmit: (query: string) => Promise<void>,
): void {
  sendMusicSignal(genreSignal(name, genres.find((g) => g.name === name)?.displayName));
  const query = `genre: ${name}`;
  setInputValue(query);
  void handleSubmit(query);
}

function LandingPageInner({ exampleShortId = null, footerNav = EMPTY_NAV_ITEMS }: LandingPageProps) {
  const t = useT();

  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const disambiguationRef = useRef<HTMLDivElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);

  const {
    state,
    active,
    resolved,
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
  } = useAppState();
  const { isReturning, capturePosition, triggerReturn } = useFlipAnimation(searchFieldRef);

  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const previousSearchTop = useRef<number | null>(null);
  const previousShowCompact = useRef(showCompact);
  const toast = useToast();

  const baseInputState: InputState =
    isDisambiguating || isClearing || isGenreBrowsing || isGenreSearching
      ? InputState.Idle
      : state.type === AppStateType.Result
        ? InputState.Success
        : (state.type as InputState);
  const inputState = baseInputState === InputState.Idle && isFocused ? InputState.Focused : baseInputState;

  // Sync input value when back-navigation restores a previous screen.
  useEffect(() => {
    if (state.type === AppStateType.GenreSearch || state.type === AppStateType.GenreSearchLoading) {
      setInputValue(state.payload.query);
    } else if (state.type === AppStateType.GenreBrowse) {
      setInputValue("genre:?");
    }
  }, [state]);

  const focusActive = state.type === AppStateType.Result ? state.active : null;
  const focusCandidates = state.type === AppStateType.Disambiguation ? state.candidates : null;
  const focusGenreResults = state.type === AppStateType.GenreSearch ? state.payload : null;
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

  const handleClearAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) return;
      if (searchFieldRef.current) {
        capturePosition();
        triggerReturn();
      }
      setInputValue("");
      handleClear();
    },
    [capturePosition, triggerReturn, handleClear],
  );

  const beginShareExit = useCallback(() => {
    try {
      window.sessionStorage.setItem("mc:focusHero", "1");
    } catch {
      // sessionStorage can be unavailable in private or locked-down contexts.
    }
    setInputValue("");
    handleClear();
  }, [handleClear]);

  const handleShareLogoClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      beginShareExit();
    },
    [beginShareExit],
  );

  const handleEscapeKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== "Escape" || !showCompact) return;
    e.preventDefault();
    if (active) {
      beginShareExit();
      return;
    }
    setInputValue("");
    handleClear();
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleEscapeKey(e);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (state.type !== AppStateType.Loading) return;

    const frame = window.requestAnimationFrame(() => {
      preloadResolveResultRuntime();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [state.type]);

  useLayoutEffect(() => {
    const el = searchFieldRef.current;
    if (!el) return;
    let transitionEndCleanup: (() => void) | undefined;

    const nextTop = el.getBoundingClientRect().top;
    const becameCompact = showCompact && !previousShowCompact.current;
    const previousTop = previousSearchTop.current;

    if (becameCompact && previousTop !== null && !isReturning) {
      const delta = previousTop - nextTop;
      if (Math.abs(delta) >= 2) {
        Object.assign(el.style, {
          transform: `translateY(${delta}px)`,
          transition: "none",
        });
        void el.offsetHeight;
        Object.assign(el.style, {
          transform: "",
          transition: "transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)",
        });

        const cleanup = () => {
          Object.assign(el.style, { transform: "", transition: "" });
          el.removeEventListener("transitionend", cleanup);
          transitionEndCleanup = undefined;
        };
        transitionEndCleanup = cleanup;
        el.addEventListener("transitionend", cleanup);
      }
    }

    previousSearchTop.current = nextTop;
    previousShowCompact.current = showCompact;

    return () => {
      if (!transitionEndCleanup) return;
      Object.assign(el.style, { transform: "", transition: "" });
      el.removeEventListener("transitionend", transitionEndCleanup);
    };
  }, [isReturning, showCompact]);

  const activeShareView = resolved ? buildShareViewFromResolvedResponse(resolved, t) : null;
  const activeShareConfig = activeShareView?.config ?? (active ? buildShareConfigFromActive(active, t) : null);
  const activeArtistName =
    activeShareView?.artistName ??
    (active ? (active.kind === ActiveResultKind.Artist ? active.name : active.artist) : "");
  const isSharePageView = !!(activeShareConfig && active);

  return (
    <>
      <LandingPageErrorAlert message={errorMessage} onDismiss={handleClear} />

      <div className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative">
        <div
          className={`flex-1 flex flex-col items-center w-full ${
            isSharePageView ? "justify-start pt-20 sm:pt-12 md:pt-14 pb-12" : "justify-center"
          }`}
        >
          {activeShareConfig && active ? (
            <ActiveShareResult
              activeArtistName={activeArtistName}
              activeShareConfig={activeShareConfig}
              artistInfoContext={activeShareView?.artistInfoContext}
              backLabel={t("genreSearch.backToResults")}
              canGoBack={canGoBack}
              handleBack={handleBack}
              handleClearAnimationEnd={handleClearAnimationEnd}
              handleShareLogoClick={handleShareLogoClick}
              isClearing={isClearing}
              resultsPanelRef={resultsPanelRef}
            />
          ) : (
            <>
              <LandingLogoBlock isReturning={isReturning} showCompact={showCompact} />

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
                />
              </div>

              {exampleShortId && (
                <LiveExampleTeaser
                  exampleShortId={exampleShortId}
                  label={t("landing.exampleLink")}
                  teaser={t("landing.exampleTeaser")}
                  visible={
                    state.type !== AppStateType.Loading && !candidates && !genreBrowseGenres && !genreSearchPayload
                  }
                />
              )}

              {candidates && candidates.length > 0 && (
                <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
                  <Suspense fallback={null}>
                    <DisambiguationPanel
                      candidates={candidates}
                      onSelect={handleSelectCandidate}
                      onCancel={handleClear}
                      selectedId={selectedCandidateId}
                      loading={state.type === AppStateType.DisambiguationLoading}
                    />
                  </Suspense>
                </div>
              )}

              {genreBrowseGenres && (
                <Suspense fallback={null}>
                  <GenreBrowseGrid
                    genres={genreBrowseGenres}
                    onSelect={(name) => selectGenreTile(name, genreBrowseGenres, setInputValue, handleSubmit)}
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

              {state.type === AppStateType.Loading && showCompact && (
                <div className="mt-6 sm:mt-8 w-full">
                  <ShareResultPlaceholder />
                </div>
              )}
            </>
          )}
        </div>

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

export function LandingPage({ exampleShortId = null, footerNav = EMPTY_NAV_ITEMS }: LandingPageProps = {}) {
  return (
    <ErrorBoundary>
      <LocaleProvider>
        <DialogProvider>
          <LandingPageInner exampleShortId={exampleShortId} footerNav={footerNav} />
        </DialogProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
