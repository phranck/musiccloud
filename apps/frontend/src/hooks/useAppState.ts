import {
  ENDPOINTS,
  type ResolveDisambiguationResponse,
  type ResolveErrorResponse,
  type ResolveGenreBrowseResponse,
  type ResolveGenreSearchResponse,
  type ResolveSuccessResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { type Dispatch, useCallback, useReducer } from "react";
import { useT } from "@/i18n/localeContext";
import { CardSignal, GenreSignal, ResolveSignal, SearchSignal, sendMusicSignal } from "@/lib/analytics/umami";
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
  handleSelectCandidate: (candidate: DisambiguationCandidate) => Promise<void>;
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
  const t = useT();
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
  const errorMessage = screen.type === "error" ? formatResolveErrorMessage(t, screen.error) : undefined;
  const showCompact = !!(
    (screen.type === "loading" && screen.compact) ||
    active ||
    screen.type === AppStateType.CcResult ||
    candidates ||
    genreBrowseGenres ||
    genreSearchPayload
  );

  const handleSubmit = useCallback(
    async (url: string) => {
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
        );
        const data = (await response.json()) as
          | UnifiedResolveSuccessResponse
          | ResolveDisambiguationResponse
          | ResolveGenreBrowseResponse
          | ResolveGenreSearchResponse
          | CcResolveData;
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
        dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(resolved), resolved });
      } catch (err) {
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [mode],
  );

  const handleSelectCandidate = useCallback(
    async (candidate: DisambiguationCandidate) => {
      sendMusicSignal(CardSignal.DisambiguationCandidate);
      dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });
      try {
        const endpoint = mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve;
        const response = await resolveFetch(endpoint, { selectedCandidate: candidate.id });
        if (mode === ResolveMode.Cc) {
          const data = (await response.json()) as CcResolveData;
          sendMusicSignal(ResolveSignal.Completed);
          dispatchCcResult(dispatch, data);
        } else {
          const data = (await response.json()) as ResolveSuccessResponse;
          const resolved: UnifiedResolveSuccessResponse = { ...data, type: "track" };
          sendMusicSignal(ResolveSignal.Completed);
          dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data), resolved });
        }
      } catch (err) {
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [mode],
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
      dispatch({ type: "SELECT_GENRE_RESULT", selectedId: id });
      try {
        // CC genre results resolve through the CC endpoint: the candidate carries
        // `id = "jamendo:<id>"`, fed straight back as `selectedCandidate`, so the
        // result stays 100% Jamendo. Commercial results resolve the picked Deezer URL.
        const response = await resolveFetch(
          mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve,
          mode === ResolveMode.Cc ? { selectedCandidate: id } : { query: webUrl },
        );
        if (mode === ResolveMode.Cc) {
          const data = (await response.json()) as CcResolveData;
          sendMusicSignal(ResolveSignal.Completed);
          dispatchCcResult(dispatch, data);
        } else {
          const data = (await response.json()) as UnifiedResolveSuccessResponse;
          sendMusicSignal(ResolveSignal.Completed);
          dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(data), resolved: data });
        }
      } catch (err) {
        sendResolveFailedSignal(err);
        dispatchResolveError(dispatch, err);
      }
    },
    [mode],
  );

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
  }, []);

  const handleBack = useCallback(() => {
    dispatch({ type: "NAV_BACK" });
  }, []);

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

/** Resolve fetches abort after this long so a stalled backend cannot hang the UI. */
const RESOLVE_FETCH_TIMEOUT_MS = 15000;

/**
 * POSTs a JSON resolve request to `endpoint` with a {@link RESOLVE_FETCH_TIMEOUT_MS}
 * abort budget and returns the raw OK `Response` for the caller to parse.
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
 * @returns The OK `Response`, ready for the caller to `json()`.
 */
async function resolveFetch(endpoint: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_FETCH_TIMEOUT_MS);
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
  }
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

function sendResolveFailedSignal(err: unknown): void {
  sendMusicSignal(err instanceof Error ? ResolveSignal.FailedClient : ResolveSignal.FailedUnknown);
}
