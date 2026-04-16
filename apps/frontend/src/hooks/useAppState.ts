import {
  ENDPOINTS,
  type ResolveDisambiguationResponse,
  type ResolveErrorResponse,
  type ResolveGenreSearchResponse,
  type ResolveSuccessResponse,
  type UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { useCallback, useReducer } from "react";
import { useT } from "@/i18n/context";
import { trackResolve } from "@/lib/analytics";
import { detectServiceFromUrl } from "@/lib/platform/url";
import {
  appReducer,
  parseAlbumResolveResponse,
  parseArtistResolveResponse,
  parseErrorKey,
  parseResolveResponse,
} from "@/lib/resolve/parsers";
import type { ActiveResult, AppState, GenreSearchPayload } from "@/lib/types/app";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

interface UseAppStateResult {
  state: AppState;
  active: ActiveResult | null;
  candidates: DisambiguationCandidate[] | null;
  selectedCandidateId: string | null;
  genreSearchPayload: GenreSearchPayload | null;
  selectedGenreResultId: string | null;
  /** True iff the current result was reached from the genre-search discovery flow. */
  canReturnToGenreSearch: boolean;
  errorMessage: string | undefined;
  showCompact: boolean;
  isClearing: boolean;
  isDisambiguating: boolean;
  isGenreSearching: boolean;
  isGenreSearchLoading: boolean;
  handleSubmit: (url: string) => Promise<void>;
  handleSelectCandidate: (candidate: DisambiguationCandidate) => Promise<void>;
  handleSelectGenreResult: (webUrl: string, id: string) => Promise<void>;
  handleBackToGenreSearch: () => void;
  handleClear: () => void;
}

/**
 * Manages the full app state machine for the landing page:
 * loading, results, disambiguation, error, and clearing states.
 */
export function useAppState(onClearColors: () => void): UseAppStateResult {
  const t = useT();
  const [state, dispatch] = useReducer(appReducer, { type: "idle" });

  const isDisambiguating = state.type === "disambiguation" || state.type === "disambiguation_loading";
  const isClearing = state.type === "clearing";
  const isGenreSearchLoading = state.type === "genre-search_loading";
  const isGenreSearching = state.type === "genre-search" || isGenreSearchLoading;
  const active = state.type === "result" ? state.active : state.type === "clearing" ? state.active : null;
  const candidates = isDisambiguating ? state.candidates : null;
  const selectedCandidateId = state.type === "disambiguation_loading" ? state.selectedId : null;
  const genreSearchPayload = isGenreSearching ? state.payload : null;
  const selectedGenreResultId = state.type === "genre-search_loading" ? state.selectedId : null;
  const canReturnToGenreSearch = state.type === "result" && !!state.returnTo;
  const errorMessage = state.type === "error" ? t(state.message) : undefined;
  const showCompact = !!(active || candidates || genreSearchPayload);

  const handleSubmit = useCallback(async (url: string) => {
    dispatch({ type: "SUBMIT" });
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
        | ResolveGenreSearchResponse;
      if ("status" in data && data.status === "disambiguation") {
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
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
      const active =
        resolved.type === "artist"
          ? parseArtistResolveResponse(resolved)
          : resolved.type === "album"
            ? parseAlbumResolveResponse(resolved)
            : parseResolveResponse(resolved);
      dispatch({ type: "RESOLVE_SUCCESS", active });
      trackResolve(detectServiceFromUrl(url));
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });
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
    } catch (err) {
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
      const active =
        data.type === "artist"
          ? parseArtistResolveResponse(data)
          : data.type === "album"
            ? parseAlbumResolveResponse(data)
            : parseResolveResponse(data);
      dispatch({ type: "RESOLVE_SUCCESS", active });
      trackResolve(detectServiceFromUrl(webUrl));
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
    onClearColors();
  }, [onClearColors]);

  /**
   * Return from the share layout back to the genre-search discovery list the
   * user came from. The album-cover-derived accent of the current result no
   * longer applies, so we also reset the accent to the brand default.
   */
  const handleBackToGenreSearch = useCallback(() => {
    dispatch({ type: "BACK_TO_GENRE_SEARCH" });
    onClearColors();
  }, [onClearColors]);

  return {
    state,
    active,
    candidates,
    selectedCandidateId,
    genreSearchPayload,
    selectedGenreResultId,
    canReturnToGenreSearch,
    errorMessage,
    showCompact,
    isClearing,
    isDisambiguating,
    isGenreSearching,
    isGenreSearchLoading,
    handleSubmit,
    handleSelectCandidate,
    handleSelectGenreResult,
    handleBackToGenreSearch,
    handleClear,
  };
}
