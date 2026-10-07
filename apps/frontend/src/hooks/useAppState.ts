import {
  ENDPOINTS,
  type ResolveDisambiguationResponse,
  type ResolveErrorResponse,
  type ResolveGenreBrowseResponse,
  type ResolveGenreSearchResponse,
  type ResolveSuccessResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { type Dispatch, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { CardSignal, GenreSignal, ResolveSignal, SearchSignal, sendMusicSignal } from "@/lib/analytics/umami";
import { detectRegion } from "@/lib/geo/detect-region";
import { parseJamendoUrl } from "@/lib/resolve/jamendoUrl";
import {
  appReducer,
  type CcResolveData,
  ccResolveDataToResult,
  formatResolveErrorMessage,
  parseResolveError,
  parseResolveResponse,
  parseUnifiedResolveResponse,
  ResolveApiError,
} from "@/lib/resolve/parsers";
import { setResolveMode } from "@/lib/resolve/resolveMode";
import { prefetchArtistInfo } from "@/lib/share/artist-info-client";
import { buildShareViewFromResolvedResponse } from "@/lib/share/share-view";
import {
  type ActiveResult,
  type AppAction,
  type AppState,
  AppStateType,
  CcResultType,
  type GenreSearchPayload,
  type ReducerState,
  ResolveMode,
  type ResolveUiError,
} from "@/lib/types/app";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

interface UseAppStateResult {
  state: AppState;
  active: ActiveResult | null;
  resolved: UnifiedResolveSuccessResponse | null;
  candidates: DisambiguationCandidate[] | null;
  selectedCandidateId: string | null;
  genreBrowseGenres: import("@musiccloud/shared").ApiGenreTile[] | null;
  genreSearchPayload: GenreSearchPayload | null;
  selectedGenreResultId: string | null;
  canGoBack: boolean;
  errorMessage: string | undefined;
  showCompact: boolean;
  isClearing: boolean;
  isDisambiguating: boolean;
  isGenreBrowsing: boolean;
  isGenreSearching: boolean;
  isGenreSearchLoading: boolean;
  handleSubmit: (url: string) => Promise<void>;
  handleSelectCandidate: (candidate: DisambiguationCandidate, revealAfter?: Promise<void>) => Promise<void>;
  handleSelectGenreResult: (webUrl: string, id: string) => Promise<void>;
  handleBack: () => void;
  handleClear: () => void;
}

/**
 * Manages the full app state machine for the landing page:
 * loading, results, disambiguation, error, and clearing states.
 *
 * @param mode - The active resolve mode. Defaults to `ResolveMode.Commercial`
 *   so existing callers without the argument compile without change (Task 6
 *   will pass the real persisted mode from the resolve-mode store).
 *   - `ResolveMode.Commercial` — submits to `/api/resolve` (commercial endpoint).
 *   - `ResolveMode.Cc` — submits to `/api/cc/resolve` (Creative Commons endpoint)
 *     and handles `cc-track` responses via `RESOLVE_CC_SUCCESS`.
 */
export function useAppState(mode: ResolveMode = ResolveMode.Commercial): UseAppStateResult {
  const initialState: ReducerState = { screen: { type: "idle" }, stack: [] };
  const [{ screen, stack }, dispatch] = useReducer(appReducer, initialState);

  const isDisambiguating = screen.type === "disambiguation" || screen.type === "disambiguation_loading";
  const isClearing = screen.type === "clearing";
  const isGenreBrowsing = screen.type === "genre-browse";
  const isGenreSearchLoading = screen.type === "genre-search_loading";
  const isGenreSearching = screen.type === "genre-search" || isGenreSearchLoading;
  const active = screen.type === "result" ? screen.active : screen.type === "clearing" ? screen.active : null;
  const resolved =
    screen.type === "result"
      ? (screen.resolved ?? null)
      : screen.type === "clearing"
        ? (screen.resolved ?? null)
        : null;
  const candidates = isDisambiguating ? screen.candidates : null;
  const selectedCandidateId = screen.type === "disambiguation_loading" ? screen.selectedId : null;
  const genreBrowseGenres = isGenreBrowsing ? screen.genres : null;
  const genreSearchPayload = isGenreSearching ? screen.payload : null;
  const selectedGenreResultId = screen.type === "genre-search_loading" ? screen.selectedId : null;
  const canGoBack = stack.length > 0;
  const errorMessage = screen.type === "error" ? formatResolveErrorMessage(screen.error) : undefined;
  const showCompact = !!(
    (screen.type === "loading" && screen.compact) ||
    active ||
    screen.type === AppStateType.CcResult ||
    candidates ||
    genreBrowseGenres ||
    genreSearchPayload
  );

  const inFlight = useInFlightRequest();

  const handleSubmit = useCallback(
    async (url: string) => {
      const request = inFlight.begin();
      sendMusicSignal(SearchSignal.Submitted);
      dispatch({ type: "SUBMIT" });
      // A pasted Jamendo track/album URL resolves the exact entity through the CC
      // path: translate it to the resolve candidate the backend understands and
      // switch the mode store to CC so the mode indicator + persistence follow.
      const jamendoCandidate = parseJamendoUrl(url);
      if (jamendoCandidate) setResolveMode(ResolveMode.Cc);
      try {
        const useCc = jamendoCandidate !== null || mode === ResolveMode.Cc;
        const endpoint = useCc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve;
        const response = await resolveFetch(
          endpoint,
          jamendoCandidate ? { selectedCandidate: jamendoCandidate } : { query: url },
          request.signal,
        );
        const data = (await response.json()) as
          | UnifiedResolveSuccessResponse
          | ResolveDisambiguationResponse
          | ResolveGenreBrowseResponse
          | ResolveGenreSearchResponse
          | CcResolveData;
        if (!request.isCurrent()) return;
        if ("status" in data && data.status === "disambiguation") {
          sendMusicSignal(ResolveSignal.Completed);
          dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
          return;
        }
        if ("status" in data && data.status === "genre-browse") {
          const browseData = data as ResolveGenreBrowseResponse;
          sendMusicSignal(GenreSignal.Overview);
          dispatch({ type: "GENRE_BROWSE", genres: browseData.genres });
          return;
        }
        if ("status" in data && data.status === "genre-search") {
          sendMusicSignal(ResolveSignal.Completed);
          dispatch({
            type: "GENRE_SEARCH",
            payload: {
              query: url,
              queryDetails: data.query,
              results: data.results,
              warnings: data.warnings,
            },
          });
          return;
        }
        if ("type" in data && isCcResolveData(data)) {
          sendMusicSignal(ResolveSignal.Completed);
          dispatchCcResult(dispatch, data);
          return;
        }
        const resolved = data as UnifiedResolveSuccessResponse;
        sendMusicSignal(ResolveSignal.Completed);
        prefetchArtistColumn(resolved);
        dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(resolved), resolved });
      } catch (err) {
        if (!request.isCurrent()) return;
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [inFlight, mode],
  );

  /**
   * Resolves a picked disambiguation candidate. The request goes out at once;
   * `revealAfter` is the panel's selection animation, and the answer is applied
   * only once it has finished, so the network time runs alongside the animation
   * instead of after it.
   */
  const handleSelectCandidate = useCallback(
    async (candidate: DisambiguationCandidate, revealAfter: Promise<void> = Promise.resolve()) => {
      const request = inFlight.begin();
      sendMusicSignal(CardSignal.DisambiguationCandidate);
      dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });
      try {
        const endpoint = mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve;
        const response = await resolveFetch(endpoint, { selectedCandidate: candidate.id }, request.signal);
        if (mode === ResolveMode.Cc) {
          const data = (await response.json()) as CcResolveData;
          await revealAfter;
          if (!request.isCurrent()) return;
          sendMusicSignal(ResolveSignal.Completed);
          dispatchCcResult(dispatch, data);
        } else {
          const data = (await response.json()) as ResolveSuccessResponse;
          const resolved: UnifiedResolveSuccessResponse = { ...data, type: "track" };
          if (request.isCurrent()) prefetchArtistColumn(resolved);
          await revealAfter;
          if (!request.isCurrent()) return;
          sendMusicSignal(ResolveSignal.Completed);
          dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data), resolved });
        }
      } catch (err) {
        await revealAfter;
        if (!request.isCurrent()) return;
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [inFlight, mode],
  );

  /**
   * Click on a row in the genre-search results panel.
   *
   * Keeps the results panel mounted (the user stays on the same view) and
   * marks the clicked item as selected so its artwork swaps to the spinning
   * CD — same UX contract as `handleSelectCandidate` for disambiguation.
   * Re-uses the URL-resolve flow under the hood (`POST /api/v1/resolve`
   * with the item's Deezer `webUrl`), so Flow 2 on the backend does the
   * cross-service resolution.
   */
  const handleSelectGenreResult = useCallback(
    async (webUrl: string, id: string) => {
      const request = inFlight.begin();
      dispatch({ type: "SELECT_GENRE_RESULT", selectedId: id });
      try {
        // CC genre results resolve through the CC endpoint: the candidate carries
        // `id = "jamendo:<id>"`, fed straight back as `selectedCandidate`, so the
        // result stays 100% Jamendo. Commercial results resolve the picked Deezer URL.
        const response = await resolveFetch(
          mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve,
          mode === ResolveMode.Cc ? { selectedCandidate: id } : { query: webUrl },
          request.signal,
        );
        if (mode === ResolveMode.Cc) {
          const data = (await response.json()) as CcResolveData;
          if (!request.isCurrent()) return;
          sendMusicSignal(ResolveSignal.Completed);
          dispatchCcResult(dispatch, data);
        } else {
          const data = (await response.json()) as UnifiedResolveSuccessResponse;
          if (!request.isCurrent()) return;
          sendMusicSignal(ResolveSignal.Completed);
          prefetchArtistColumn(data);
          dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(data), resolved: data });
        }
      } catch (err) {
        if (!request.isCurrent()) return;
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [inFlight, mode],
  );

  // Leaving a screen abandons its request, so its answer cannot land on the
  // screen the user went to.
  const handleClear = useCallback(() => {
    inFlight.cancel();
    dispatch({ type: "CLEAR_START" });
  }, [inFlight]);

  const handleBack = useCallback(() => {
    inFlight.cancel();
    dispatch({ type: "NAV_BACK" });
  }, [inFlight]);

  return {
    state: screen,
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
  };
}

/**
 * Resolve fetches abort after this long so a stalled backend cannot hang the UI.
 * It is longer than the 15 s the Astro proxy gives the backend (`resolveTrack`
 * in `api/client.ts`), so a backend timeout arrives as the proxy's envelope
 * with its error code and error ID instead of as a bare browser abort.
 */
const RESOLVE_FETCH_TIMEOUT_MS = 20000;

/**
 * POSTs a JSON resolve request to `endpoint` with a {@link RESOLVE_FETCH_TIMEOUT_MS}
 * abort budget and returns the raw OK `Response` for the caller to parse. Aborting
 * `signal`, the request's in-flight slot, cancels the request as well.
 *
 * The success body is intentionally NOT decoded here: each caller reads a
 * different discriminated union (unified / disambiguation / genre-browse /
 * genre-search / CC), so that branching stays at the call site. On a non-OK
 * status it throws {@link ResolveApiError} built from the error body. The abort
 * timer is cleared in a `finally`, so even a network rejection cannot leave a
 * dangling timer that later aborts an already-settled request.
 *
 * @param endpoint - Resolve endpoint URL.
 * @param body - Request payload, JSON-stringified as the POST body.
 * @param signal - The in-flight slot's signal.
 * @returns The OK `Response`, ready for the caller to `json()`.
 */
async function resolveFetch(endpoint: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_FETCH_TIMEOUT_MS);
  const forwardAbort = () => controller.abort(signal.reason);
  if (signal.aborted) forwardAbort();
  signal.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Partial<ResolveErrorResponse>;
      throw new ResolveApiError(errorData);
    }
    return response;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", forwardAbort);
  }
}

/**
 * One in-flight request at a time. Starting a request aborts the previous one,
 * and `isCurrent` tells a handler whether its answer still belongs to what the
 * screen shows, so a late answer can never replace a newer state.
 */
interface InFlightRequest {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

/**
 * Owns the landing page's single in-flight request slot.
 *
 * @returns `begin` to start a request (aborting the one before it) and `cancel`
 *   to abort the running one without starting another, for clear and back.
 */
function useInFlightRequest() {
  const currentRef = useRef<AbortController | null>(null);

  const begin = useCallback((): InFlightRequest => {
    currentRef.current?.abort();
    const controller = new AbortController();
    currentRef.current = controller;
    return { signal: controller.signal, isCurrent: () => currentRef.current === controller };
  }, []);

  const cancel = useCallback(() => {
    currentRef.current?.abort();
    currentRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  // Stable identity, because the handlers built on it are effect and memo
  // dependencies further down the tree.
  return useMemo(() => ({ begin, cancel }), [begin, cancel]);
}

function dispatchResolveError(dispatch: Dispatch<{ type: "ERROR"; error: ResolveUiError }>, err: unknown): void {
  dispatch({ type: "ERROR", error: parseResolveError(err) });
}

/**
 * Type guard: true when a resolve payload is one of the three CC success shapes.
 * Lets the commercial submit path tell a CC result apart from a unified
 * (`track`/`album`/`artist`) commercial result by its `cc-*` discriminant.
 */
function isCcResolveData(data: { type?: string }): data is CcResolveData {
  return (
    data.type === CcResultType.CcTrack || data.type === CcResultType.CcAlbum || data.type === CcResultType.CcArtist
  );
}

/**
 * Dispatches `RESOLVE_CC_SUCCESS` for a CC resolve payload, mapping it to a
 * {@link CcResult} via {@link ccResolveDataToResult} (the single type-to-parser home).
 */
function dispatchCcResult(dispatch: Dispatch<AppAction>, data: CcResolveData): void {
  dispatch({ type: "RESOLVE_CC_SUCCESS", ccActive: ccResolveDataToResult(data) });
}

/**
 * Starts the artist column's request as soon as a commercial resolve answers.
 * The landing page reveals the result only after its loading animation, and the
 * column asks for its data only once it mounts, so this saves that wait. The
 * arguments are built exactly as the column builds them, which is what lets it
 * take the request over.
 *
 * @param resolved - The commercial resolve answer about to be shown.
 */
function prefetchArtistColumn(resolved: UnifiedResolveSuccessResponse): void {
  const view = buildShareViewFromResolvedResponse(resolved);
  prefetchArtistInfo(view.artistName, detectRegion(), view.artistInfoContext);
}

function sendResolveFailedSignal(err: unknown): void {
  sendMusicSignal(err instanceof Error ? ResolveSignal.FailedClient : ResolveSignal.FailedUnknown);
}
