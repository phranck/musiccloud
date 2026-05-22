import {
  ENDPOINTS,
  type ResolveDisambiguationResponse,
  type ResolveErrorResponse,
  type ResolveGenreBrowseResponse,
  type ResolveGenreSearchResponse,
  type ResolveSuccessResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { useCallback, useReducer } from "react";
import { useT } from "@/i18n/context";
import { trackResolve, trackResolveFailed, trackResolveStarted, trackSearchSubmitted } from "@/lib/analytics";
import { detectServiceFromUrl } from "@/lib/platform/url";
import { appReducer, parseErrorKey, parseResolveResponse, parseUnifiedResolveResponse } from "@/lib/resolve/parsers";
import type { ActiveResult, AppState, GenreSearchPayload, ReducerState } from "@/lib/types/app";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

function queryType(query: string): string {
  if (/^genre\s*:/i.test(query)) return "genre";
  if (/^https?:\/\//i.test(query)) return "url";
  return "text";
}

interface UseAppStateResult {
  state: AppState;
  active: ActiveResult | null;
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
 */
export function useAppState(): UseAppStateResult {
  const t = useT();
  const initialState: ReducerState = { screen: { type: "idle" }, stack: [] };
  const [{ screen, stack }, dispatch] = useReducer(appReducer, initialState);

  const isDisambiguating = screen.type === "disambiguation" || screen.type === "disambiguation_loading";
  const isClearing = screen.type === "clearing";
  const isGenreBrowsing = screen.type === "genre-browse";
  const isGenreSearchLoading = screen.type === "genre-search_loading";
  const isGenreSearching = screen.type === "genre-search" || isGenreSearchLoading;
  const active = screen.type === "result" ? screen.active : screen.type === "clearing" ? screen.active : null;
  const candidates = isDisambiguating ? screen.candidates : null;
  const selectedCandidateId = screen.type === "disambiguation_loading" ? screen.selectedId : null;
  const genreBrowseGenres = isGenreBrowsing ? screen.genres : null;
  const genreSearchPayload = isGenreSearching ? screen.payload : null;
  const selectedGenreResultId = screen.type === "genre-search_loading" ? screen.selectedId : null;
  const canGoBack = stack.length > 0;
  const errorMessage = screen.type === "error" ? t(screen.message) : undefined;
  const showCompact = !!(
    (screen.type === "loading" && screen.compact) ||
    active ||
    candidates ||
    genreBrowseGenres ||
    genreSearchPayload
  );

  const handleSubmit = useCallback(async (url: string) => {
    dispatch({ type: "SUBMIT" });
    const sourcePlatform = detectServiceFromUrl(url);
    trackSearchSubmitted(url, queryType(url));
    trackResolveStarted(sourcePlatform, "landing_search");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(ENDPOINTS.frontend.resolve, {
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
      const data = (await response.json()) as
        | UnifiedResolveSuccessResponse
        | ResolveDisambiguationResponse
        | ResolveGenreBrowseResponse
        | ResolveGenreSearchResponse;
      if ("status" in data && data.status === "disambiguation") {
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
        return;
      }
      if ("status" in data && data.status === "genre-browse") {
        const browseData = data as ResolveGenreBrowseResponse;
        dispatch({ type: "GENRE_BROWSE", genres: browseData.genres });
        return;
      }
      if ("status" in data && data.status === "genre-search") {
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
      const resolved = data as UnifiedResolveSuccessResponse;
      dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(resolved) });
      trackResolve(sourcePlatform, "landing_search");
    } catch (err) {
      trackResolveFailed(sourcePlatform, "landing_search", parseErrorKey(err));
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });
    trackResolveStarted("selected_candidate", "disambiguation");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(ENDPOINTS.frontend.resolve, {
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
      dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data) });
      trackResolve("selected_candidate", "disambiguation");
    } catch (err) {
      trackResolveFailed("selected_candidate", "disambiguation", parseErrorKey(err));
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

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
  const handleSelectGenreResult = useCallback(async (webUrl: string, id: string) => {
    dispatch({ type: "SELECT_GENRE_RESULT", selectedId: id });
    const sourcePlatform = detectServiceFromUrl(webUrl);
    trackResolveStarted(sourcePlatform, "genre_search_result");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(ENDPOINTS.frontend.resolve, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: webUrl }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as Partial<ResolveErrorResponse>;
        throw new Error(errorData.message || "error.generic");
      }
      const data = (await response.json()) as UnifiedResolveSuccessResponse;
      dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(data) });
      trackResolve(sourcePlatform, "genre_search_result");
    } catch (err) {
      trackResolveFailed(sourcePlatform, "genre_search_result", parseErrorKey(err));
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
  }, []);

  const handleBack = useCallback(() => {
    dispatch({ type: "NAV_BACK" });
  }, []);

  return {
    state: screen,
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
  };
}
