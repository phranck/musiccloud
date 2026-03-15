import type {
  AlbumResolveSuccessResponse,
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
  ResolveSuccessResponse,
} from "@musiccloud/shared";
import { useCallback, useReducer } from "react";
import { useT } from "@/i18n/context";
import { isAlbumUrl } from "@/lib/platform/url";
import { appReducer, parseAlbumResolveResponse, parseErrorKey, parseResolveResponse } from "@/lib/resolve/parsers";
import type { ActiveResult, AppState } from "@/lib/types/app";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

interface UseAppStateResult {
  state: AppState;
  active: ActiveResult | null;
  candidates: DisambiguationCandidate[] | null;
  selectedCandidateId: string | null;
  errorMessage: string | undefined;
  showCompact: boolean;
  isClearing: boolean;
  isDisambiguating: boolean;
  handleSubmit: (url: string) => Promise<void>;
  handleSelectCandidate: (candidate: DisambiguationCandidate) => Promise<void>;
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
  const active = state.type === "result" ? state.active : state.type === "clearing" ? state.active : null;
  const candidates = isDisambiguating ? state.candidates : null;
  const selectedCandidateId = state.type === "disambiguation_loading" ? state.selectedId : null;
  const errorMessage = state.type === "error" ? t(state.message) : undefined;
  const showCompact = !!(active || candidates);

  const handleSubmit = useCallback(async (url: string) => {
    dispatch({ type: "SUBMIT" });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
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
        dispatch({ type: "RESOLVE_SUCCESS", active: parseAlbumResolveResponse(data) });
        return;
      }
      const data = (await response.json()) as ResolveSuccessResponse | ResolveDisambiguationResponse;
      if ("status" in data && data.status === "disambiguation") {
        dispatch({ type: "DISAMBIGUATION", candidates: data.candidates });
        return;
      }
      dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data as ResolveSuccessResponse) });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleSelectCandidate = useCallback(async (candidate: DisambiguationCandidate) => {
    dispatch({ type: "SELECT_CANDIDATE", selectedId: candidate.id });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
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
      dispatch({ type: "RESOLVE_SUCCESS", active: parseResolveResponse(data) });
    } catch (err) {
      dispatch({ type: "ERROR", message: parseErrorKey(err) });
    }
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: "CLEAR_START" });
    onClearColors();
  }, [onClearColors]);

  return {
    state,
    active,
    candidates,
    selectedCandidateId,
    errorMessage,
    showCompact,
    isClearing,
    isDisambiguating,
    handleSubmit,
    handleSelectCandidate,
    handleClear,
  };
}
