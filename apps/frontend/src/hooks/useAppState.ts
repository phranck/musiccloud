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
import { useT } from "@/i18n/context";
import {
  classifySearchInput,
  MusicInteractionAction,
  MusicInteractionSurface,
  MusicResolveFlow,
  searchInputLengthBucket,
  sendMusicSignal,
} from "@/lib/analytics/umami";
import {
  appReducer,
  formatResolveErrorMessage,
  parseResolveError,
  parseResolveResponse,
  parseUnifiedResolveResponse,
  ResolveApiError,
} from "@/lib/resolve/parsers";
import type { ActiveResult, AppState, GenreSearchPayload, ReducerState, ResolveUiError } from "@/lib/types/app";
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
    candidates ||
    genreBrowseGenres ||
    genreSearchPayload
  );

  const handleSubmit = useCallback(async (url: string) => {
    const inputKind = classifySearchInput(url);
    const inputLength = searchInputLengthBucket(url);
    sendMusicSignal("music_search_submitted", {
      input_kind: inputKind,
      input_length: inputLength,
    });
    sendMusicSignal("music_resolve_started", {
      flow: MusicResolveFlow.LandingSearch,
      input_kind: inputKind,
      input_length: inputLength,
      surface: MusicInteractionSurface.Landing,
    });
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
        throw new ResolveApiError(errorData);
      }
      const data = (await response.json()) as
        | UnifiedResolveSuccessResponse
        | ResolveDisambiguationResponse
        | ResolveGenreBrowseResponse
        | ResolveGenreSearchResponse;
      if ("status" in data && data.status === "disambiguation") {
        sendMusicSignal("music_source_search_success", {
          result_kind: "disambiguation",
          candidate_count: data.candidates.length,
        });
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
        return;
      }
      if ("status" in data && data.status === "genre-browse") {
        const browseData = data as ResolveGenreBrowseResponse;
        sendMusicSignal("music_source_search_success", {
          result_kind: "genre_browse",
          result_count: browseData.genres.length,
        });
        dispatch({ type: "GENRE_BROWSE", genres: browseData.genres });
        return;
      }
      if ("status" in data && data.status === "genre-search") {
        const resultCount = Object.values(data.results).reduce((sum, list) => sum + (list?.length ?? 0), 0);
        sendMusicSignal("music_source_search_success", {
          result_kind: "genre_search",
          result_count: resultCount,
          warning_count: data.warnings.length,
        });
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
      sendMusicSignal("music_source_search_success", {
        result_kind: "resolved",
        content_type: resolved.type,
        service_count: resolved.links.length,
      });
      dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(resolved), resolved });
    } catch (err) {
      sendResolveFailedSignal(err, {
        flow: MusicResolveFlow.LandingSearch,
        input_kind: inputKind,
        input_length: inputLength,
        surface: MusicInteractionSurface.Landing,
      });
      dispatchResolveError(dispatch, err);
    }
  }, []);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    sendMusicSignal("music_interaction", {
      action: MusicInteractionAction.DisambiguationCandidateSelected,
      surface: MusicInteractionSurface.Landing,
    });
    sendMusicSignal("music_resolve_started", {
      flow: MusicResolveFlow.DisambiguationCandidate,
      surface: MusicInteractionSurface.Landing,
    });
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
        throw new ResolveApiError(errorData);
      }
      const data = (await response.json()) as ResolveSuccessResponse;
      const resolved: UnifiedResolveSuccessResponse = { ...data, type: "track" };
      sendMusicSignal("music_source_search_success", {
        result_kind: "candidate_resolved",
        content_type: resolved.type,
        service_count: resolved.links.length,
      });
      dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data), resolved });
    } catch (err) {
      sendResolveFailedSignal(err, {
        flow: MusicResolveFlow.DisambiguationCandidate,
        surface: MusicInteractionSurface.Landing,
      });
      dispatchResolveError(dispatch, err);
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
    sendMusicSignal("music_interaction", {
      action: MusicInteractionAction.GenreResultSelected,
      surface: MusicInteractionSurface.Landing,
    });
    sendMusicSignal("music_resolve_started", {
      flow: MusicResolveFlow.GenreResult,
      surface: MusicInteractionSurface.Landing,
    });
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
        throw new ResolveApiError(errorData);
      }
      const data = (await response.json()) as UnifiedResolveSuccessResponse;
      sendMusicSignal("music_source_search_success", {
        result_kind: "genre_result_resolved",
        content_type: data.type,
        service_count: data.links.length,
      });
      dispatch({ type: "RESOLVE_SUCCESS", active: parseUnifiedResolveResponse(data), resolved: data });
    } catch (err) {
      sendResolveFailedSignal(err, {
        flow: MusicResolveFlow.GenreResult,
        surface: MusicInteractionSurface.Landing,
      });
      dispatchResolveError(dispatch, err);
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

function dispatchResolveError(dispatch: Dispatch<{ type: "ERROR"; error: ResolveUiError }>, err: unknown): void {
  dispatch({ type: "ERROR", error: parseResolveError(err) });
}

function sendResolveFailedSignal(
  err: unknown,
  properties: Record<string, string | number | boolean | null | undefined>,
): void {
  const parsed = parseResolveError(err);
  sendMusicSignal("music_resolve_failed", {
    ...properties,
    error_code: parsed.code,
    error_kind: parsed.key.replace(/^errorCodes\./, ""),
  });
}
