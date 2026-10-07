import { ARTIST_PROFILE_TTL_MS, type ArtistEvent, type ArtistProfile, type ArtistTopTrack } from "@musiccloud/shared";
import type { ArtistCacheData, ArtistCacheIdentity, TrackRepository } from "../db/repository.js";
import { createSingleFlight } from "../lib/concurrency.js";
import { log } from "../lib/infra/logger.js";
import {
  type ArtistInfoFetch,
  type ArtistProfileSnapshot,
  fetchArtistEvents,
  fetchArtistProfileSnapshot,
  fetchArtistTopTracks,
} from "./artist-info.js";

export const ArtistInfoSection = {
  Profile: "profile",
  TopTracks: "topTracks",
  Events: "events",
} as const;

export type ArtistInfoSection = (typeof ArtistInfoSection)[keyof typeof ArtistInfoSection];
type ArtistInfoSectionValue = ArtistProfile | ArtistTopTrack[] | ArtistEvent[] | null;
type ArtistInfoSectionFetchValue = ArtistProfileSnapshot | ArtistTopTrack[] | ArtistEvent[] | null;

/**
 * How long a stored section counts as fresh. The sections change at different
 * rates: chart positions move weekly, bios and similar artists hardly at all,
 * and tour dates daily. A stale section is served and refreshed in the
 * background.
 */
export const ARTIST_INFO_SECTION_TTL_MS: Record<ArtistInfoSection, number> = {
  [ArtistInfoSection.Profile]: ARTIST_PROFILE_TTL_MS,
  [ArtistInfoSection.TopTracks]: 7 * 24 * 60 * 60 * 1000,
  [ArtistInfoSection.Events]: 24 * 60 * 60 * 1000,
};

/**
 * How soon a section fetched while a source was failing is fetched again. It
 * is stored only when nothing was stored before, and dated so that it turns
 * stale after this window instead of after the section's full TTL.
 */
export const INCOMPLETE_SECTION_RETRY_MS = 15 * 60 * 1000;

type ArtistInfoCacheRepository = Pick<TrackRepository, "saveArtistCache">;

interface RefreshInput {
  repo: ArtistInfoCacheRepository;
  identity: ArtistCacheIdentity;
  artistName: string;
  requestId?: string;
  /** Refresh-start version. An older task may not overwrite a newer task. */
  startedAt: number;
  /**
   * Whether the cache already holds this section. A fetch that a failing
   * source left incomplete never replaces a stored section.
   */
  hasStoredValue: boolean;
}

interface ArtistInfoRefreshDependencies {
  fetchArtistProfileSnapshot: (artistName: string) => Promise<ArtistInfoFetch<ArtistProfileSnapshot | null>>;
  fetchArtistTopTracks: (artistName: string) => Promise<ArtistInfoFetch<ArtistTopTrack[]>>;
  fetchArtistEvents: (artistName: string) => Promise<ArtistInfoFetch<ArtistEvent[]>>;
  logDeviation: typeof log.deviation;
}

function cacheIdentityKey(identity: ArtistCacheIdentity): string {
  return identity.kind === "entity" ? `entity:${identity.artistEntityId}` : `name:${identity.artistName}`;
}

function sectionCacheData(
  section: ArtistInfoSection,
  input: RefreshInput,
  value: ArtistInfoSectionFetchValue,
  updatedAt: number,
): ArtistCacheData {
  const base = { identity: input.identity, artistName: input.artistName };
  if (section === ArtistInfoSection.Profile) {
    const snapshot = value as ArtistProfileSnapshot | null;
    return {
      ...base,
      profile: snapshot?.profile ?? null,
      profileProviders: snapshot?.providers ?? [],
      profileUpdatedAt: updatedAt,
    };
  }
  if (section === ArtistInfoSection.TopTracks) {
    return { ...base, topTracks: value as ArtistTopTrack[], tracksUpdatedAt: updatedAt };
  }
  return { ...base, events: value as ArtistEvent[], eventsUpdatedAt: updatedAt };
}

function sectionPublicValue(section: ArtistInfoSection, value: ArtistInfoSectionFetchValue): ArtistInfoSectionValue {
  if (section === ArtistInfoSection.Profile) return (value as ArtistProfileSnapshot | null)?.profile ?? null;
  return value as ArtistTopTrack[] | ArtistEvent[];
}

/**
 * Creates cache refresh ownership for Artist Info sections. The factory makes
 * the concurrency boundary deterministic in tests while the exported default
 * instance owns live in-process single-flight state.
 *
 * A complete fetch is stored with its start time. An incomplete one, where a
 * source failed instead of answering, never replaces a stored section, because
 * an outage would otherwise be remembered as "this artist has no top tracks"
 * for a week. Without a stored section it is stored dated so that it turns
 * stale after {@link INCOMPLETE_SECTION_RETRY_MS}: the column shows what
 * could be fetched, and the next request after the window refreshes it in the
 * background.
 */
export function createArtistInfoRefreshCoordinator(dependencies: ArtistInfoRefreshDependencies) {
  const refreshOnce = createSingleFlight<string, ArtistInfoSectionValue>();
  const scheduleOnce = createSingleFlight<string, void>();

  function fetchSection(
    section: ArtistInfoSection,
    artistName: string,
  ): Promise<ArtistInfoFetch<ArtistInfoSectionFetchValue>> {
    if (section === ArtistInfoSection.Profile) return dependencies.fetchArtistProfileSnapshot(artistName);
    if (section === ArtistInfoSection.TopTracks) return dependencies.fetchArtistTopTracks(artistName);
    return dependencies.fetchArtistEvents(artistName);
  }

  function refresh(section: ArtistInfoSection, input: RefreshInput): Promise<ArtistInfoSectionValue> {
    return refreshOnce(`${cacheIdentityKey(input.identity)}:${section}`, async () => {
      const { value, complete } = await fetchSection(section, input.artistName);
      if (section === ArtistInfoSection.Profile && value === null) return null;

      if (complete) {
        await input.repo.saveArtistCache(sectionCacheData(section, input, value, input.startedAt));
      } else {
        if (!input.hasStoredValue) {
          const retryAt = input.startedAt - ARTIST_INFO_SECTION_TTL_MS[section] + INCOMPLETE_SECTION_RETRY_MS;
          await input.repo.saveArtistCache(sectionCacheData(section, input, value, retryAt));
        }
        dependencies.logDeviation({
          component: "ArtistInfo",
          errorCode: "MC-API-0004",
          operation: `artist_info_${section}_refresh`,
          outcome: input.hasStoredValue ? "stored_section_kept" : "short_lived_section_stored",
          requestId: input.requestId,
          cacheIdentity: cacheIdentityKey(input.identity),
        });
      }
      return sectionPublicValue(section, value);
    });
  }

  function schedule(section: ArtistInfoSection, input: RefreshInput): Promise<void> {
    return scheduleOnce(`${cacheIdentityKey(input.identity)}:${section}`, () =>
      refresh(section, input)
        .then(() => undefined)
        .catch((error) => {
          dependencies.logDeviation(
            {
              component: "ArtistInfo",
              errorCode: "MC-SYS-0001",
              operation: `artist_info_${section}_background_refresh`,
              outcome: "last_good_cache_retained",
              requestId: input.requestId,
              cacheIdentity: cacheIdentityKey(input.identity),
            },
            error,
          );
        }),
    );
  }

  return { refresh, schedule };
}

export const artistInfoRefreshCoordinator = createArtistInfoRefreshCoordinator({
  fetchArtistProfileSnapshot,
  fetchArtistTopTracks,
  fetchArtistEvents,
  logDeviation: log.deviation,
});
