import type { ArtistEvent, ArtistProfile, ArtistTopTrack } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import type { ArtistCacheData, ArtistCacheIdentity } from "../../db/repository.js";
import { createArtistInfoRefreshCoordinator } from "../artist-info-cache.js";

const PROFILE: ArtistProfile = {
  imageUrl: null,
  genres: [],
  popularity: null,
  followers: null,
  bioSummary: "A profile",
  scrobbles: null,
  similarArtists: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function refreshInput(identity: ArtistCacheIdentity = { kind: "entity", artistEntityId: "artist-1" }) {
  return { identity, artistName: "Artist One", requestId: "req-1", startedAt: 1_000 };
}

describe("artist-info refresh coordination", () => {
  it("shares one stale profile refresh and releases the key after it settles", async () => {
    const pendingProfile = deferred<ArtistProfile | null>();
    const fetchProfile = vi.fn(() => pendingProfile.promise);
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfile: fetchProfile,
      fetchArtistTopTracks: vi.fn<(...args: [string]) => Promise<ArtistTopTrack[]>>(),
      fetchArtistEvents: vi.fn<(...args: [string]) => Promise<ArtistEvent[]>>(),
      logDeviation: vi.fn(),
    });

    const first = coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });
    const second = coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });

    expect(first).toBe(second);
    expect(fetchProfile).toHaveBeenCalledTimes(1);

    pendingProfile.resolve(PROFILE);
    await first;

    expect(saveArtistCache).toHaveBeenCalledWith({
      identity: { kind: "entity", artistEntityId: "artist-1" },
      artistName: "Artist One",
      profile: PROFILE,
      profileUpdatedAt: 1_000,
    });

    await coordinator.schedule("profile", { repo: { saveArtistCache }, ...refreshInput() });
    expect(fetchProfile).toHaveBeenCalledTimes(2);
  });

  it("shares one required section refresh across concurrent cold callers", async () => {
    const pendingTracks = deferred<ArtistTopTrack[]>();
    const fetchArtistTopTracks = vi.fn(() => pendingTracks.promise);
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfile: vi.fn<(...args: [string]) => Promise<ArtistProfile | null>>(),
      fetchArtistTopTracks,
      fetchArtistEvents: vi.fn<(...args: [string]) => Promise<ArtistEvent[]>>(),
      logDeviation: vi.fn(),
    });

    const first = coordinator.refresh("topTracks", { repo: { saveArtistCache }, ...refreshInput() });
    const second = coordinator.refresh("topTracks", { repo: { saveArtistCache }, ...refreshInput() });

    expect(fetchArtistTopTracks).toHaveBeenCalledTimes(1);
    pendingTracks.resolve([]);
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(saveArtistCache).toHaveBeenCalledTimes(1);
  });

  it("runs different sections and artists independently", async () => {
    const fetchProfile = vi.fn<(...args: [string]) => Promise<ArtistProfile | null>>().mockResolvedValue(PROFILE);
    const fetchArtistTopTracks = vi.fn<(...args: [string]) => Promise<ArtistTopTrack[]>>().mockResolvedValue([]);
    const saveArtistCache = vi.fn<(...args: [ArtistCacheData]) => Promise<void>>().mockResolvedValue(undefined);
    const coordinator = createArtistInfoRefreshCoordinator({
      fetchArtistProfile: fetchProfile,
      fetchArtistTopTracks,
      fetchArtistEvents: vi.fn<(...args: [string]) => Promise<ArtistEvent[]>>(),
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
      fetchArtistProfile: vi.fn<(...args: [string]) => Promise<ArtistProfile | null>>().mockRejectedValue(cause),
      fetchArtistTopTracks: vi.fn<(...args: [string]) => Promise<ArtistTopTrack[]>>(),
      fetchArtistEvents: vi.fn<(...args: [string]) => Promise<ArtistEvent[]>>(),
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
