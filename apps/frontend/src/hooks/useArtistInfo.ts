import type { ArtistInfoResponse } from "@musiccloud/shared";
import { useEffect, useReducer, useRef } from "react";
import type { ArtistInfoStatus } from "@/components/artist/artistPanelTypes";
import {
  type ArtistInfoContext,
  artistFetchErrorCode,
  fetchArtistInfo,
  fetchCcArtistInfo,
} from "@/lib/share/artist-info-client";

/**
 * Abort timeout for the commercial artist-info fetch, in milliseconds. The
 * backend blocks the response while it refetches stale cache sections from
 * upstream (Deezer top tracks, Last.fm/Spotify profile, Bandsintown events,
 * plus up to three similar-artist lookups), which under concurrent load
 * routinely takes well over five seconds. The budget sits above that so a
 * slow-but-valid response still fills the artist column instead of aborting
 * it to an empty one (all four cards render `null` on no data).
 */
const ARTIST_FETCH_TIMEOUT_MS = 15000;
/** CC artist-info fetches mirror Jamendo live (~4 throttled calls), so they get a
 *  wider budget than the fast commercial Last.fm lookup. */
const CC_ARTIST_FETCH_TIMEOUT_MS = 20000;

/**
 * Value namespace for the artist-info load phase. `satisfies` pins every member
 * to the canonical {@link ArtistInfoStatus} union so the two can never drift
 * apart. Exported so `ShareLayout` (which drives the VFD status line off the
 * same phases) compares against one source of truth.
 */
export const ArtistLoadStatus = {
  Loading: "loading",
  Ready: "ready",
  Empty: "empty",
  Error: "error",
} as const satisfies Record<string, ArtistInfoStatus>;

/** Internal reducer action discriminants for the artist-info load lifecycle. */
const ArtistActionType = {
  Loading: "loading",
  Done: "done",
  Error: "error",
} as const;

/** Reducer state for the artist-info load: current phase, data, optional error code. */
type ArtistState = { status: ArtistInfoStatus; artistData: ArtistInfoResponse | null; errorCode?: string };
type ArtistAction =
  | { type: typeof ArtistActionType.Loading }
  | { type: typeof ArtistActionType.Done; data: ArtistInfoResponse | null }
  | { type: typeof ArtistActionType.Error; code: string };

/**
 * True when an artist-info payload carries any renderable content (a profile,
 * top tracks, events, or similar-artist tracks). Drives the `ready` vs `empty`
 * distinction so an empty response surfaces the "no info" state instead of an
 * apparently-loaded-but-blank column.
 *
 * @param data - The artist-info payload, or `null` when none was fetched.
 * @returns `true` when at least one content section is non-empty.
 */
function hasArtistInfoContent(data: ArtistInfoResponse | null): boolean {
  return Boolean(
    data &&
      (data.profile ||
        (data.topTracks?.length ?? 0) > 0 ||
        (data.events?.length ?? 0) > 0 ||
        (data.similarArtistTracks?.length ?? 0) > 0),
  );
}

/**
 * Reduces the artist-info load lifecycle. `Loading` keeps the prior data
 * (avoids a flash to empty during a refetch); `Done` resolves to `ready` or
 * `empty` based on {@link hasArtistInfoContent}; `Error` clears the data and
 * records the error code.
 */
function artistReducer(state: ArtistState, action: ArtistAction): ArtistState {
  if (action.type === ArtistActionType.Loading)
    return { status: ArtistLoadStatus.Loading, artistData: state.artistData };
  if (action.type === ArtistActionType.Error)
    return { status: ArtistLoadStatus.Error, artistData: null, errorCode: action.code };
  return {
    status: hasArtistInfoContent(action.data) ? ArtistLoadStatus.Ready : ArtistLoadStatus.Empty,
    artistData: action.data,
  };
}

/** Inputs that drive the artist-info load. */
export interface UseArtistInfoOptions {
  /** Artist name to fetch info for. */
  artistName: string;
  /** ISO region used to localize results (empty string when unknown). */
  userRegion: string;
  /** Narrowing context for the lookup (short id / artist entity id). */
  context: ArtistInfoContext;
  /**
   * Caller-supplied artist data. When {@link UseArtistInfoOptions.skipArtistFetch}
   * is set, this seeds the state directly instead of fetching (the CC path).
   */
  artistDataProp?: ArtistInfoResponse | null;
  /** Suppresses the internal fetch — the caller supplies `artistDataProp`. */
  skipArtistFetch: boolean;
  /**
   * CC path: when set, the hook fetches the CC artist column via
   * `/api/cc/artist-info` for this Jamendo artist id instead of the commercial
   * `/api/artist-info` — so a CC share/result renders its core card immediately
   * and loads the column async, like commercial.
   */
  ccJamendoArtistId?: string;
  /**
   * Called once each load settles (fetch resolved/rejected, or seed applied).
   * Lets the owner clear any "resolve triggered a load" UI state in the same
   * order the inline effects did.
   */
  onFetchSettled?: () => void;
}

/** What the hook exposes to the presentation layer. */
export interface UseArtistInfoResult {
  /** Current load phase. */
  status: ArtistInfoStatus;
  /** The loaded artist data, or `null`. */
  artistData: ArtistInfoResponse | null;
  /** Error code from a failed fetch (e.g. `TIMEOUT`, `HTTP 500`), if any. */
  errorCode?: string;
  /** Convenience flag: `true` while the phase is `loading`. */
  isLoading: boolean;
}

/**
 * Owns the artist-info fetch lifecycle for the share layout.
 *
 * Mirrors `useAppState` in shape: holds the reducer, runs the immediate fetch
 * (with a {@link ARTIST_FETCH_TIMEOUT_MS} abort timeout and proper cancellation
 * on unmount / input change), and seeds directly from caller-supplied data when
 * `skipArtistFetch` is set (the Creative-Commons path, which has no commercial
 * artist-info endpoint). All endpoint/fetch knowledge lives in
 * {@link fetchArtistInfo}; this hook only drives state.
 *
 * @param options - {@link UseArtistInfoOptions}.
 * @returns {@link UseArtistInfoResult} — the current phase, data, error code,
 *   and a derived `isLoading` flag.
 */
export function useArtistInfo({
  artistName,
  userRegion,
  context,
  artistDataProp,
  skipArtistFetch,
  ccJamendoArtistId,
  onFetchSettled,
}: UseArtistInfoOptions): UseArtistInfoResult {
  const [state, dispatch] = useReducer(artistReducer, {
    status: ArtistLoadStatus.Loading,
    artistData: null,
  });

  // Kept in a ref so the settle callback never widens the fetch effect's
  // dependency set — the effect must re-run only on the data inputs, exactly as
  // the inline version did.
  const onFetchSettledRef = useRef(onFetchSettled);
  onFetchSettledRef.current = onFetchSettled;

  // Caller-supplied artist data (CC): seed the reducer directly, no fetch.
  useEffect(() => {
    if (!skipArtistFetch) return;
    dispatch({ type: ArtistActionType.Done, data: artistDataProp ?? null });
    onFetchSettledRef.current?.();
  }, [skipArtistFetch, artistDataProp]);

  // Fetch artist data immediately (SSR already rendered the share card).
  // Skipped when the caller pre-supplies it (skipArtistFetch).
  useEffect(() => {
    if (skipArtistFetch) return;
    let cancelled = false;
    dispatch({ type: ArtistActionType.Loading });
    const controller = new AbortController();
    const timeoutMs = ccJamendoArtistId ? CC_ARTIST_FETCH_TIMEOUT_MS : ARTIST_FETCH_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const request = ccJamendoArtistId
      ? fetchCcArtistInfo(ccJamendoArtistId, artistName, controller.signal)
      : fetchArtistInfo(artistName, userRegion, context, controller.signal);
    request
      .then((data) => {
        if (!cancelled) dispatch({ type: ArtistActionType.Done, data });
      })
      .catch((err) => {
        if (!cancelled) dispatch({ type: ArtistActionType.Error, code: artistFetchErrorCode(err) });
      })
      .finally(() => {
        if (!cancelled) onFetchSettledRef.current?.();
        clearTimeout(timeout);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [context, artistName, userRegion, skipArtistFetch, ccJamendoArtistId]);

  return {
    status: state.status,
    artistData: state.artistData,
    errorCode: state.errorCode,
    isLoading: state.status === ArtistLoadStatus.Loading,
  };
}
