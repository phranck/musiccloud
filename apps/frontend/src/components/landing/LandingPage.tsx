import { useGSAP } from "@gsap/react";
import type { NavItem } from "@musiccloud/shared";
import {
  lazy,
  type MouseEvent,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { HeroInput } from "@/components/landing/HeroInput";
import { LandingPageErrorAlert } from "@/components/landing/LandingPageErrorAlert";
import { AppFooter } from "@/components/layout/AppFooter";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
import { LogoView } from "@/components/ui/LogoView";
import { DialogProvider } from "@/context/DialogContext";
import { useAppState } from "@/hooks/useAppState";
import { useDeferredResultReveal } from "@/hooks/useDeferredResultReveal";
import { useHeroFieldFlip } from "@/hooks/useHeroFieldFlip";
import { useSearchFieldReturn } from "@/hooks/useSearchFieldReturn";
import { useToast } from "@/hooks/useToast";
import { LocaleProvider, useT } from "@/i18n/context";
import { CardSignal, genreSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { animateFadeIn, animateSlideOutDown } from "@/lib/motion/entrances";
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
  /**
   * Fires once when the clearing slide-out has finished (or immediately on
   * the reduced-motion path) and hands over to the search-field return
   * staging — see `useSearchFieldReturn`.
   */
  onClearSlideOutComplete: () => void;
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
  onClearSlideOutComplete,
  handleShareLogoClick,
  isClearing,
  resultsPanelRef,
}: ActiveShareResultProps) {
  // Clearing slide-out (GSAP port of the removed `animate-slide-out-down`
  // class). The clear choreography continues from the timeline's
  // `onComplete` — the `animationend` event this replaced does not exist for
  // JS tweens (break class 719a656). Unmounting mid-flight (e.g. Escape
  // while clearing) reverts the useGSAP context, killing the tween and
  // suppressing the handover — the same outcome the CSS animation had when
  // its element left the DOM before `animationend`.
  useGSAP(
    () => {
      if (!isClearing) return;
      const panel = resultsPanelRef.current;
      if (!panel) return;
      const tween = animateSlideOutDown(panel, { onComplete: onClearSlideOutComplete });
      // Reduced motion: no tween exists — the clear flow must not depend on
      // an animation playing, so hand over synchronously (pre-paint).
      if (!tween) onClearSlideOutComplete();
    },
    { dependencies: [isClearing] },
  );

  return (
    <div
      ref={resultsPanelRef}
      tabIndex={-1}
      className={`outline-none w-full ${isClearing ? "pointer-events-none" : ""}`}
    >
      <div className="mb-4 text-center sm:mb-6">
        <a href="/" aria-label="Go to musiccloud home" className="inline-block" onClick={handleShareLogoClick}>
          <LogoView className="w-56 sm:w-64 h-auto" />
        </a>
      </div>
      <FadeInOnMount>
        <Suspense fallback={<ShareResultPlaceholder />}>
          <ShareLayout
            config={activeShareConfig}
            artistName={activeArtistName}
            artistInfoContext={artistInfoContext}
            onBack={canGoBack ? handleBack : undefined}
            backLabel={canGoBack ? backLabel : undefined}
          />
        </Suspense>
      </FadeInOnMount>
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
      <a href={`/${exampleShortId}`} onClick={() => sendMusicSignal(CardSignal.LiveExample)} className="mc-skylink">
        {label}
      </a>
    </p>
  );
}

function LandingLogoBlock({ isReturning, showCompact }: { isReturning: boolean; showCompact: boolean }) {
  const logoRef = useRef<HTMLDivElement>(null);

  // While the search-field return flip travels, the large logo fades back in
  // (GSAP port of the removed conditional `animate-fade-in` class). Keyed on
  // both flags: compact-cancel flows flip them in the same commit.
  useGSAP(
    () => {
      if (!isReturning || showCompact) return;
      const el = logoRef.current;
      if (!el) return;
      animateFadeIn(el);
    },
    { dependencies: [isReturning, showCompact] },
  );

  if (showCompact) {
    return (
      <div className="mb-6">
        <LogoView className="w-56 h-auto" />
      </div>
    );
  }

  return (
    <div ref={logoRef} className="flex justify-center mb-10">
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

  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const resetInputValue = useCallback(() => setInputValue(""), []);
  const { isReturning, isFieldReturnStaging, armFieldReturn, handleCancelWithReturn, handleClearSlideOutComplete } =
    useSearchFieldReturn(searchFieldRef, { showCompact, onClear: handleClear, onResetInput: resetInputValue });
  useHeroFieldFlip(searchFieldRef, { showCompact, isReturning });
  const toast = useToast();

  const baseInputState: InputState =
    isDisambiguating || isClearing || isGenreBrowsing || isGenreSearching
      ? InputState.Idle
      : state.type === AppStateType.Result
        ? InputState.Success
        : (state.type as InputState);
  const inputState = baseInputState === InputState.Idle && isFocused ? InputState.Focused : baseInputState;

  // Hold the share-result reveal until the hero's spinning disc has slid out.
  const { discExitPending, onLoadingExitComplete: handleLoadingExitComplete } = useDeferredResultReveal(
    active,
    inputState,
  );

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
    armFieldReturn();
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

  const activeShareView = resolved ? buildShareViewFromResolvedResponse(resolved, t) : null;
  const activeShareConfig = activeShareView?.config ?? (active ? buildShareConfigFromActive(active, t) : null);
  const activeArtistName =
    activeShareView?.artistName ??
    (active ? (active.kind === ActiveResultKind.Artist ? active.name : active.artist) : "");
  const isSharePageView = !!(activeShareConfig && active && !discExitPending);

  return (
    <>
      <LandingPageErrorAlert message={errorMessage} onDismiss={handleClear} />

      <div className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative">
        <div
          className={`flex-1 flex flex-col items-center w-full ${
            isSharePageView ? "justify-start pt-20 sm:pt-12 md:pt-14 pb-12" : "justify-center"
          }`}
        >
          {/* During return-flip staging the (invisible, pre-paint) idle branch
              must render so the field's compact position is measurable — see
              the staging layout effect. */}
          {activeShareConfig && active && !isFieldReturnStaging && !discExitPending ? (
            <ActiveShareResult
              activeArtistName={activeArtistName}
              activeShareConfig={activeShareConfig}
              artistInfoContext={activeShareView?.artistInfoContext}
              backLabel={t("genreSearch.backToResults")}
              canGoBack={canGoBack}
              handleBack={handleBack}
              onClearSlideOutComplete={handleClearSlideOutComplete}
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
                    armFieldReturn();
                    setInputValue("");
                    handleClear();
                  }}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  state={discExitPending ? InputState.Loading : inputState}
                  compact={showCompact}
                  requestDiscExit={discExitPending}
                  onLoadingExitComplete={handleLoadingExitComplete}
                />
              </div>

              {exampleShortId && (
                <LiveExampleTeaser
                  exampleShortId={exampleShortId}
                  label={t("landing.exampleLink")}
                  teaser={t("landing.exampleTeaser")}
                  visible={
                    state.type !== AppStateType.Loading &&
                    !discExitPending &&
                    !candidates &&
                    !genreBrowseGenres &&
                    !genreSearchPayload
                  }
                />
              )}

              {candidates && candidates.length > 0 && (
                <div ref={disambiguationRef} tabIndex={-1} className="outline-none w-full">
                  <Suspense fallback={null}>
                    <DisambiguationPanel
                      candidates={candidates}
                      onSelect={handleSelectCandidate}
                      onCancel={handleCancelWithReturn}
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
                    onCancel={handleCancelWithReturn}
                    onBack={canGoBack ? handleBack : undefined}
                    selectedId={selectedGenreResultId}
                    loading={isGenreSearchLoading}
                  />
                </Suspense>
              )}

              {(state.type === AppStateType.Loading || discExitPending) && showCompact && (
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
