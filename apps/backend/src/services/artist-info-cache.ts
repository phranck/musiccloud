import type { ArtistEvent, ArtistProfile, ArtistTopTrack } from "@musiccloud/shared";
import type { ArtistCacheData, ArtistCacheIdentity, TrackRepository } from "../db/repository.js";
import { log } from "../lib/infra/logger.js";
import {
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

type ArtistInfoCacheRepository = Pick<TrackRepository, "saveArtistCache">;

interface RefreshInput {
  repo: ArtistInfoCacheRepository;
  identity: ArtistCacheIdentity;
  artistName: string;
  requestId?: string;
  /** Refresh-start version. An older task may not overwrite a newer task. */
  startedAt: number;
}

interface ArtistInfoRefreshDependencies {
  fetchArtistProfileSnapshot: (artistName: string) => Promise<ArtistProfileSnapshot | null>;
  fetchArtistTopTracks: (artistName: string) => Promise<ArtistTopTrack[]>;
  fetchArtistEvents: (artistName: string) => Promise<ArtistEvent[]>;
  logDeviation: typeof log.deviation;
}

function cacheIdentityKey(identity: ArtistCacheIdentity): string {
  return identity.kind === "entity" ? `entity:${identity.artistEntityId}` : `name:${identity.artistName}`;
}

function sectionCacheData(
  section: ArtistInfoSection,
  input: RefreshInput,
  value: ArtistInfoSectionFetchValue,
): ArtistCacheData {
  const base = { identity: input.identity, artistName: input.artistName };
  if (section === ArtistInfoSection.Profile) {
    const snapshot = value as ArtistProfileSnapshot | null;
    return {
      ...base,
      profile: snapshot?.profile ?? null,
      profileProviders: snapshot?.providers ?? [],
      profileUpdatedAt: input.startedAt,
    };
  }
  if (section === ArtistInfoSection.TopTracks) {
    return { ...base, topTracks: value as ArtistTopTrack[], tracksUpdatedAt: input.startedAt };
  }
  return { ...base, events: value as ArtistEvent[], eventsUpdatedAt: input.startedAt };
}

function sectionPublicValue(section: ArtistInfoSection, value: ArtistInfoSectionFetchValue): ArtistInfoSectionValue {
  if (section === ArtistInfoSection.Profile) return (value as ArtistProfileSnapshot | null)?.profile ?? null;
  return value as ArtistTopTrack[] | ArtistEvent[];
}

/**
 * Creates cache refresh ownership for Artist Info sections. The factory makes
 * the concurrency boundary deterministic in tests while the exported default
 * instance owns live in-process single-flight state.
 */
export function createArtistInfoRefreshCoordinator(dependencies: ArtistInfoRefreshDependencies) {
  const inFlight = new Map<string, Promise<ArtistInfoSectionValue>>();
  const scheduled = new Map<string, Promise<void>>();

  function refresh(section: ArtistInfoSection, input: RefreshInput): Promise<ArtistInfoSectionValue> {
    const key = `${cacheIdentityKey(input.identity)}:${section}`;
    const existing = inFlight.get(key);
    if (existing) return existing;

    const task = (async () => {
      const value =
        section === ArtistInfoSection.Profile
          ? await dependencies.fetchArtistProfileSnapshot(input.artistName)
          : section === ArtistInfoSection.TopTracks
            ? await dependencies.fetchArtistTopTracks(input.artistName)
            : await dependencies.fetchArtistEvents(input.artistName);
      await input.repo.saveArtistCache(sectionCacheData(section, input, value));
      return sectionPublicValue(section, value);
    })();
    inFlight.set(key, task);
    void task.then(
      () => {
        if (inFlight.get(key) === task) inFlight.delete(key);
      },
      () => {
        if (inFlight.get(key) === task) inFlight.delete(key);
      },
    );
    return task;
  }

  function schedule(section: ArtistInfoSection, input: RefreshInput): Promise<void> {
    const key = `${cacheIdentityKey(input.identity)}:${section}`;
    const existing = scheduled.get(key);
    if (existing) return existing;

    let task: Promise<void>;
    task = refresh(section, input)
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
      })
      .finally(() => {
        if (scheduled.get(key) === task) scheduled.delete(key);
      });
    scheduled.set(key, task);
    return task;
  }

  return { refresh, schedule };
}

export const artistInfoRefreshCoordinator = createArtistInfoRefreshCoordinator({
  fetchArtistProfileSnapshot,
  fetchArtistTopTracks,
  fetchArtistEvents,
  logDeviation: log.deviation,
});
