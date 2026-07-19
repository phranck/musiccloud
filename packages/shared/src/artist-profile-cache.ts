export const ARTIST_PROFILE_TTL_MS = 183 * 24 * 60 * 60 * 1_000;

export type ArtistProfileProvider = "spotify" | "deezer" | "lastfm";

export type ArtistProfileRefreshOutcome = "refreshing" | "succeeded" | "failed";

export type ArtistProfileCacheState = "fresh" | "stale" | "missing" | "refreshing" | "failed";

export interface ArtistProfileManualRefreshSummary {
  trigger: "manual";
  occurredAt: string;
  completedAt: string | null;
  outcome: ArtistProfileRefreshOutcome;
  errorCode: string | null;
  errorId: string | null;
}

export interface ArtistProfileCacheStatus {
  state: ArtistProfileCacheState;
  profileUpdatedAt: string | null;
  ageMs: number | null;
  providers: ArtistProfileProvider[];
  latestManualRefresh: ArtistProfileManualRefreshSummary | null;
}

export interface ArtistProfileCacheStatusInput {
  profileUpdatedAt: string | null;
  profileProviders: ArtistProfileProvider[];
  latestManualRefresh: ArtistProfileManualRefreshSummary | null;
}

export interface AdminArtistListItem {
  id: string;
  artistEntityId: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  sourceService: string | null;
  linkCount: number;
  createdAt: number;
  shortId: string | null;
  profileCache: ArtistProfileCacheStatus;
}

export interface ArtistProfileRefreshResponse {
  artistEntityId: string;
  profileCache: ArtistProfileCacheStatus;
  manualRefresh: ArtistProfileManualRefreshSummary;
}

export function classifyArtistProfileCacheStatus(
  input: ArtistProfileCacheStatusInput,
  now = new Date(),
): ArtistProfileCacheStatus {
  const profileUpdatedAtMs = input.profileUpdatedAt ? Date.parse(input.profileUpdatedAt) : Number.NaN;
  const hasValidProfileTimestamp = Number.isFinite(profileUpdatedAtMs);
  const profileUpdatedAt = hasValidProfileTimestamp ? input.profileUpdatedAt : null;
  const ageMs = hasValidProfileTimestamp ? Math.max(0, now.getTime() - profileUpdatedAtMs) : null;
  const latestManualRefresh = input.latestManualRefresh;

  let state: ArtistProfileCacheState;
  if (latestManualRefresh?.outcome === "refreshing") {
    state = "refreshing";
  } else if (
    latestManualRefresh?.outcome === "failed" &&
    (!hasValidProfileTimestamp || Date.parse(latestManualRefresh.occurredAt) > profileUpdatedAtMs)
  ) {
    state = "failed";
  } else if (!hasValidProfileTimestamp) {
    state = "missing";
  } else if (ageMs !== null && ageMs > ARTIST_PROFILE_TTL_MS) {
    state = "stale";
  } else {
    state = "fresh";
  }

  return {
    state,
    profileUpdatedAt,
    ageMs,
    providers: [...new Set(input.profileProviders)],
    latestManualRefresh,
  };
}
