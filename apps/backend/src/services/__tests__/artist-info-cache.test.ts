import type { ArtistEvent, ArtistProfile, ArtistTopTrack } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import type { ArtistCacheData, ArtistCacheIdentity } from "../../db/repository.js";
import type { ArtistInfoFetch, ArtistProfileSnapshot } from "../artist-info.js";
import {
  ARTIST_INFO_SECTION_TTL_MS,
  createArtistInfoRefreshCoordinator,
  INCOMPLETE_SECTION_RETRY_MS,
} from "../artist-info-cache.js";

const PROFILE: ArtistProfile = {
  imageUrl: null,
  genres: [],
  popularity: null,
  followers: null,
  bioSummary: "A profile",
  scrobbles: null,
  similarArtists: [],
};

const PROFILE_SNAPSHOT: ArtistProfileSnapshot = {
  profile: PROFILE,
  providers: ["spotify", "lastfm"],
};

const TRACK: ArtistTopTrack = {
  title: "Alison",
  artists: ["Slowdive"],
  albumName: "Souvlaki",
  artworkUrl: null,
  durationMs: null,
  deezerUrl: "https://www.deezer.com/track/1",
  shortId: null,
};

type ProfileFetch = (artistName: string) => Promise<ArtistInfoFetch<ArtistProfileSnapshot | null>>;
type TracksFetch = (artistName: string) => Promise<ArtistInfoFetch<ArtistTopTrack[]>>;
type EventsFetch = (artistName: string) => Promise<ArtistInfoFetch<ArtistEvent[]>>;

function complete<Value>(value: Value): ArtistInfoFetch<Value> {
  return { value, complete: true };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function refreshInput(
  identity: ArtistCacheIdentity = { kind: "entity", artistEntityId: "artist-1" },
  hasStoredValue = false,
) {
  return { identity, artistName: "Artist One", requestId: "req-1", startedAt: 1_000, hasStoredValue };
}

describe("artist-info refresh coordination", () => {
  it("shares one stale profile refresh and releases the key after it settles", async () => {
    const pendingProfile = deferred<ArtistInfoFetch<ArtistProfileSnapshot | null>>();
    const fetchProfile = vi.fn<ProfileFetch>(() => pendingProfile.promise);
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: fetchProfile,
      fetchArtistTopTracks: vi.fn<TracksFetch>(),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    const first = coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });
    const second = coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });

    expect(first).toBe(second);
    expect(fetchProfile).toHaveBeenCalledTimes(1);

    pendingProfile.resolve(complete(PROFILE_SNAPSHOT));
    await first;

    expect(saveArtistCache).toHaveBeenCalledWith({
      identity: { kind: "entity", artistEntityId: "artist-1" },
      artistName: "Artist One",
      profile: PROFILE,
      profileProviders: ["spotify", "lastfm"],
      profileUpdatedAt: 1_000,
    });

    await coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it("shares one required section refresh across concurrent cold callers", async () => {
    const pendingTracks = deferred<ArtistInfoFetch<ArtistTopTrack[]>>();
    const fetchArtistTopTracks = vi.fn<TracksFetch>(() => pendingTracks.promise);
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>(),
      fetchArtistTopTracks,
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    const first = coordinator.refresh("topTracks", { repo: { saveArtistCache }, ...refreshInput() });
    const second = coordinator.refresh("topTracks", { repo: { saveArtistCache }, ...refreshInput() });

    expect(fetchArtistTopTracks).toHaveBeenCalledTimes(1);
    pendingTracks.resolve(complete([]));
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(saveArtistCache).toHaveBeenCalledTimes(1);
  });

  it("returns the public profile value while persisting its provider snapshot", async () => {
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>().mockResolvedValue(complete(PROFILE_SNAPSHOT)),
      fetchArtistTopTracks: vi.fn<TracksFetch>(),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    await expect(coordinator.refresh("profile", { repo: { saveArtistCache }, ...refreshInput() })).resolves.toEqual(
      PROFILE,
    );
  });

  it("does not overwrite the last-good profile when providers return no usable profile", async () => {
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>().mockResolvedValue(complete(null)),
      fetchArtistTopTracks: vi.fn<TracksFetch>(),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    await expect(coordinator.refresh("profile", { repo: { saveArtistCache }, ...refreshInput() })).resolves.toBeNull();
    expect(saveArtistCache).not.toHaveBeenCalled();
  });

  it("runs different sections and artists independently", async () => {
    const fetchProfile = vi.fn<ProfileFetch>().mockResolvedValue(complete(PROFILE_SNAPSHOT));
    const fetchArtistTopTracks = vi.fn<TracksFetch>().mockResolvedValue(complete([]));
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: fetchProfile,
      fetchArtistTopTracks,
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    await Promise.all([
      coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() }),
      coordinator.schedule("topTracks", { repo: { saveArtistCache }, ...refreshInput() }),
      coordinator.schedule("profile", {
        repo: { saveArtistCache },
        ...refreshInput({ kind: "entity", artistEntityId: "artist-2" }),
      }),
    ]);

    expect(fetchProfile).toHaveBeenCalledTimes(2);
    expect(fetchArtistTopTracks).toHaveBeenCalledTimes(1);
  });

  it("keeps the last-good section and records a structured fallback when background refresh fails", async () => {
    const cause = new Error("upstream token=private");
    const logDeviation = vi.fn();
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>().mockRejectedValue(cause),
      fetchArtistTopTracks: vi.fn<TracksFetch>(),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation,
    });
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() }),
    ).resolves.toBeUndefined();

    expect(saveArtistCache).not.toHaveBeenCalled();
    expect(logDeviation).toHaveBeenCalledWith(
      expect.objectContaining({
        component: "ArtistInfo",
        errorCode: "MC-SYS-0001",
        operation: "artist_info_profile_background_refresh",
        outcome: "last_good_cache_retained",
        requestId: "req-1",
      }),
      cause,
    );
  });
});

describe("artist-info refresh with a failing source", () => {
  /**
   * The point of the rule: one bad minute at Deezer must not replace a week of
   * top tracks with an empty list.
   */
  it("keeps a stored section when the fetch was incomplete", async () => {
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const logDeviation = vi.fn();
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>(),
      fetchArtistTopTracks: vi.fn<TracksFetch>().mockResolvedValue({ value: [], complete: false }),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation,
    });

    await coordinator.refresh("topTracks", {
      repo: { saveArtistCache },
      ...refreshInput(undefined, true),
    });

    expect(saveArtistCache).not.toHaveBeenCalled();
    expect(logDeviation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "artist_info_topTracks_refresh", outcome: "stored_section_kept" }),
    );
  });

  it("stores an incomplete section without a stored one so that it turns stale after the retry window", async () => {
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfileSnapshot: vi.fn<ProfileFetch>(),
      fetchArtistTopTracks: vi.fn<TracksFetch>().mockResolvedValue({ value: [TRACK], complete: false }),
      fetchArtistEvents: vi.fn<EventsFetch>(),
      logDeviation: vi.fn(),
    });

    await expect(coordinator.refresh("topTracks", { repo: { saveArtistCache }, ...refreshInput() })).resolves.toEqual([
      TRACK,
    ]);

    expect(saveArtistCache).toHaveBeenCalledWith(
      expect.objectContaining({
        topTracks: [TRACK],
        tracksUpdatedAt: 1_000 - ARTIST_INFO_SECTION_TTL_MS.topTracks + INCOMPLETE_SECTION_RETRY_MS,
      }),
    );
  });
});
