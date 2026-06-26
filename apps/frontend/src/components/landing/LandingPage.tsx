import type { NavItem } from "@musiccloud/shared";
import {
  lazy,
  type MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActiveShareResult } from "@/components/landing/ActiveShareResult";
import { CcShareResult } from "@/components/landing/CcShareResult";
import { HeroInput } from "@/components/landing/HeroInput";
import { LandingLogoBlock } from "@/components/landing/LandingLogoBlock";
import { LandingPageErrorAlert } from "@/components/landing/LandingPageErrorAlert";
import { LiveExampleTeaser } from "@/components/landing/LiveExampleTeaser";
import { ResolveModeSwitcher } from "@/components/landing/ResolveModeSwitcher";
import { ShareResultPlaceholder } from "@/components/landing/ShareResultPlaceholder";
import { AppFooter } from "@/components/layout/AppFooter";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DialogProvider } from "@/context/DialogContext";
import { useAppState } from "@/hooks/useAppState";
import { useDeferredResultReveal } from "@/hooks/useDeferredResultReveal";
import { useGenreSearchParam } from "@/hooks/useGenreSearchParam";
import { useHeroFieldFlip } from "@/hooks/useHeroFieldFlip";
import { useSearchFieldReturn } from "@/hooks/useSearchFieldReturn";
import { useToast } from "@/hooks/useToast";
import { LocaleProvider } from "@/i18n/context";
import { useT } from "@/i18n/localeContext";
import type { Locale } from "@/i18n/locales";
import { genreSignal, sendMusicSignal } from "@/lib/analytics/umami";
import {
  loadDisambiguationPanel,
  loadGenreBrowseGrid,
  loadGenreSearchResults,
  loadToast,
  preloadResolveResultRuntime,
} from "@/lib/preload/resultRuntime";
import { buildGenreQuery, GENRE_BROWSE_QUERY } from "@/lib/resolve/genre-query";
import { getResolveMode, subscribeResolveMode } from "@/lib/resolve/resolveMode";
import { buildActiveShareSelection } from "@/lib/share/share-view";
import { AppStateType, type CcResult, InputState, ResolveMode } from "@/lib/types/app";

// Lazy-loaded panels — only pulled into the bundle when the user needs them.
// Fallback is `null` because each is only rendered behind a visibility flag anyway.
const DisambiguationPanel = lazy(loadDisambiguationPanel);
const GenreBrowseGrid = lazy(loadGenreBrowseGrid);
const GenreSearchResults = lazy(loadGenreSearchResults);
const Toast = lazy(loadToast);

const EMPTY_NAV_ITEMS: NavItem[] = [];

interface LandingPageProps {
  exampleShortId?: string | null;
  /** CC track short id for the live-example link in Creative-Commons mode. */
  ccExampleShortId?: string | null;
  footerNav?: NavItem[];
  /** Server-resolved locale, so SSR and client hydration agree (no mismatch). */
  initialLocale?: Locale;
  /**
   * Whether to render the in-page footer. The homepage renders it; routes that
   * already provide their own footer (e.g. the `/[shortId]` content-overlay
   * shell, which has its own `DeferredFooter`) pass false to avoid a duplicate.
   */
  showFooter?: boolean;
}

function selectGenreTile(
  name: string,
  genres: import("@musiccloud/shared").ApiGenreTile[],
  setInputValue: (next: string) => void,
  handleSubmit: (query: string) => Promise<void>,
): void {
  sendMusicSignal(genreSignal(name, genres.find((g) => g.name === name)?.displayName));
  const query = buildGenreQuery(name);
  setInputValue(query);
  void handleSubmit(query);
}

function LandingPageInner({
  exampleShortId = null,
  ccExampleShortId = null,
  footerNav = EMPTY_NAV_ITEMS,
  showFooter = true,
}: LandingPageProps) {
  const t = useT();

  // Resolve mode (commercial | cc) from the shared persistent store. SSR and the
  // pre-init client snapshot both fall back to the commercial default so first
  // paint and hydration agree; the stored mode reconciles right after hydration.
  const mode = useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial);

  // The live-example link points at a CC track in CC mode, else a commercial
  // track; falls back to the commercial example when no CC example exists yet.
  const activeExampleShortId = mode === ResolveMode.Cc && ccExampleShortId ? ccExampleShortId : exampleShortId;

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
  } = useAppState(mode);

  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const resetInputValue = useCallback(() => setInputValue(""), []);
  const { isReturning, isFieldReturnStaging, armFieldReturn, handleCancelWithReturn, handleClearSlideOutComplete } =
    useSearchFieldReturn(searchFieldRef, { showCompact, onClear: handleClear, onResetInput: resetInputValue });
  useHeroFieldFlip(searchFieldRef, { showCompact, isReturning });
  const toast = useToast();
  // A genre link from a page without its own search flow lands here with
  // `?genre=<name>`; this runs that search on mount.
  useGenreSearchParam(handleSubmit, setInputValue);

  // Memoized so a stable element identity reaches HeroInput's `leadingControl`.
  const heroLeadingControl = useMemo(() => (showCompact ? undefined : <ResolveModeSwitcher />), [showCompact]);

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
      setInputValue(GENRE_BROWSE_QUERY);
    }
  }, [state]);

  const focusActive =
    state.type === AppStateType.Result ? state.active : state.type === AppStateType.CcResult ? state.ccActive : null;
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
    if (active || isCcResultView) {
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

  const { activeShareView, activeShareConfig, activeArtistName } = buildActiveShareSelection(resolved, active, t);
  const isSharePageView = !!(activeShareConfig && active && !discExitPending);

  // Creative-Commons result: a self-contained state branch (no `active`,
  // no `resolved`) carrying just the CC track. Rendered through its own
  // single-column view, sharing the result-page framing (top-aligned, logo
  // home link) with the commercial share view.
  const ccActive: CcResult | null = state.type === AppStateType.CcResult ? state.ccActive : null;
  const isCcResultView = ccActive !== null;

  return (
    <>
      <LandingPageErrorAlert message={errorMessage} onDismiss={handleClear} />

      <div className="flex-1 flex flex-col items-center px-4 transition-colors duration-700 relative">
        <div
          className={`flex-1 flex flex-col items-center w-full ${
            isSharePageView || isCcResultView
              ? "justify-start pt-[calc(env(safe-area-inset-top)+5rem)] sm:pt-12 md:pt-14 pb-12"
              : "justify-center"
          }`}
        >
          {/* During return-flip staging the (invisible, pre-paint) idle branch
              must render so the field's compact position is measurable — see
              the staging layout effect. */}
          {ccActive ? (
            <CcShareResult
              ccActive={ccActive}
              handleShareLogoClick={handleShareLogoClick}
              resultsPanelRef={resultsPanelRef}
              canGoBack={canGoBack}
              handleBack={handleBack}
              t={t}
            />
          ) : activeShareConfig && active && !isFieldReturnStaging && !discExitPending ? (
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

              <div ref={searchFieldRef} data-resolve-mode={mode} className="w-full flex items-center justify-center">
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
                  leadingControl={heroLeadingControl}
                  requestDiscExit={discExitPending}
                  onLoadingExitComplete={handleLoadingExitComplete}
                />
              </div>

              {!showCompact && activeExampleShortId && (
                <div className="mt-4 flex justify-center" data-resolve-mode={mode}>
                  <LiveExampleTeaser
                    exampleShortId={activeExampleShortId}
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
                </div>
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

      {showFooter && <AppFooter navItems={footerNav} />}
    </>
  );
}

export function LandingPage({
  exampleShortId = null,
  ccExampleShortId = null,
  footerNav = EMPTY_NAV_ITEMS,
  initialLocale,
  showFooter = true,
}: LandingPageProps = {}) {
  return (
    <ErrorBoundary>
      <LocaleProvider initialLocale={initialLocale}>
        <DialogProvider>
          <LandingPageInner
            exampleShortId={exampleShortId}
            ccExampleShortId={ccExampleShortId}
            footerNav={footerNav}
            showFooter={showFooter}
          />
        </DialogProvider>
      </LocaleProvider>
    </ErrorBoundary>
  );
}
