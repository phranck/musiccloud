import type { VinylLayout } from "@musiccloud/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readCachedAlbumVinylLayout, resolveAlbumVinylLayout, resolveTrackVinylLayout } from "./track-vinyl-layout.js";

vi.mock("../lib/infra/logger.js", () => ({
  log: { deviation: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const layout: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [{ label: "A", tracks: [{ position: "A1", title: "The Sermon!", durationMs: 1_210_000 }] }],
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Lets a detached enrichment run to its end, including its `finally`. */
function flushBackgroundWork(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createRepository() {
  return {
    readVinylLayout: vi.fn(),
    enrichVinylLayout: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("resolveTrackVinylLayout", () => {
  it("returns a cached layout without a Discogs request", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toEqual(layout);

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  /**
   * A stored `null` means Discogs was already asked and holds no vinyl
   * pressing. Asking again on every resolve is what the negative cache exists
   * to prevent.
   */
  it("respects a negative cache instead of asking Discogs again", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(null);

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toBeNull();

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  /**
   * One enrichment takes at least three Discogs requests through a queue
   * spaced 1.1 s apart. The resolve must answer without it, even when Discogs
   * never answers at all.
   */
  it("answers an unchecked identity at once and enriches it in the background", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);
    repo.enrichVinylLayout.mockReturnValue(new Promise(() => {}));

    await expect(resolveTrackVinylLayout(repo, { artists: ["Art Blakey"], albumName: "Moanin'" })).resolves.toBeNull();

    expect(repo.enrichVinylLayout).toHaveBeenCalledWith({
      identityKey: "art blakey::moanin",
      title: "Moanin'",
      artists: ["Art Blakey"],
      albumId: undefined,
    });
  });

  it("never uses a title-only lookup when the primary artist is absent", async () => {
    const repo = createRepository();

    await expect(resolveTrackVinylLayout(repo, { artists: [], albumName: "The Sermon!" })).resolves.toBeNull();

    expect(repo.readVinylLayout).not.toHaveBeenCalled();
    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  it("returns null when the track carries no album name", async () => {
    const repo = createRepository();

    await expect(resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"] })).resolves.toBeNull();

    expect(repo.readVinylLayout).not.toHaveBeenCalled();
  });

  it("keeps a failure non-fatal for the resolve", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockRejectedValue(new Error("database unavailable"));

    await expect(
      resolveTrackVinylLayout(repo, { artists: ["Jimmy Smith"], albumName: "The Sermon!" }),
    ).resolves.toBeNull();
  });
});

describe("resolveAlbumVinylLayout", () => {
  /**
   * A share open reaches this function on every request, so a stored layout has
   * to answer without touching Discogs. Enriching on a hit would put an upstream
   * round-trip on the read path of every Creative Commons share page.
   */
  it("answers from the stored layout without enriching", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(resolveAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" })).resolves.toEqual(
      layout,
    );

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
    expect(repo.readVinylLayout).toHaveBeenCalledTimes(1);
  });

  /**
   * The layout belongs to the identity, but the Discogs release id is recorded
   * against a catalogue album where one exists, so the album has to reach the
   * enrichment step.
   */
  it("passes the catalogue album through when the caller has one", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValueOnce(layout);
    repo.enrichVinylLayout.mockResolvedValue(undefined);

    await resolveAlbumVinylLayout(repo, { artists: ["Lee Morgan"], title: "The Sidewinder", albumId: "album-1" });

    expect(repo.enrichVinylLayout).toHaveBeenCalledWith(expect.objectContaining({ albumId: "album-1" }));
  });

  it("starts one enrichment per identity while it is running", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);
    repo.enrichVinylLayout.mockReturnValue(new Promise(() => {}));

    await resolveAlbumVinylLayout(repo, { artists: ["Horace Silver"], title: "Song for My Father" });
    await resolveAlbumVinylLayout(repo, { artists: ["Horace Silver"], title: "Song for My Father" });

    expect(repo.enrichVinylLayout).toHaveBeenCalledTimes(1);
  });

  it("serves the enriched layout from the next request on", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValueOnce(undefined).mockResolvedValue(layout);
    repo.enrichVinylLayout.mockResolvedValue(undefined);

    await expect(
      resolveAlbumVinylLayout(repo, { artists: ["Hank Mobley"], title: "Soul Station" }),
    ).resolves.toBeNull();
    await flushBackgroundWork();

    await expect(resolveAlbumVinylLayout(repo, { artists: ["Hank Mobley"], title: "Soul Station" })).resolves.toEqual(
      layout,
    );
    expect(repo.enrichVinylLayout).toHaveBeenCalledTimes(1);
  });

  /**
   * An incomplete release stores nothing, and Discogs answers the same way on
   * the next attempt. Retrying on every resolve would occupy the shared queue
   * for nothing, so the identity rests for the cooldown.
   */
  it("does not repeat an attempt that stored nothing until the cooldown has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);
    repo.enrichVinylLayout.mockResolvedValue(undefined);
    const album = { artists: ["Dexter Gordon"], title: "Go" };

    await resolveAlbumVinylLayout(repo, album);
    await flushBackgroundWork();
    await resolveAlbumVinylLayout(repo, album);
    expect(repo.enrichVinylLayout).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + SIX_HOURS_MS));
    await resolveAlbumVinylLayout(repo, album);
    expect(repo.enrichVinylLayout).toHaveBeenCalledTimes(2);
  });

  it("rests a failed enrichment for the cooldown as well", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);
    repo.enrichVinylLayout.mockRejectedValue(new Error("Discogs unavailable"));
    const album = { artists: ["Wayne Shorter"], title: "Speak No Evil" };

    await expect(resolveAlbumVinylLayout(repo, album)).resolves.toBeNull();
    await flushBackgroundWork();
    await resolveAlbumVinylLayout(repo, album);

    expect(repo.enrichVinylLayout).toHaveBeenCalledTimes(1);
  });
});

describe("readCachedAlbumVinylLayout", () => {
  it("reads an existing layout without enriching", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(layout);

    await expect(readCachedAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" })).resolves.toEqual(
      layout,
    );

    expect(repo.enrichVinylLayout).not.toHaveBeenCalled();
  });

  it("reports an unchecked identity as no layout rather than as an error", async () => {
    const repo = createRepository();
    repo.readVinylLayout.mockResolvedValue(undefined);

    await expect(
      readCachedAlbumVinylLayout(repo, { artists: ["Jimmy Smith"], title: "The Sermon!" }),
    ).resolves.toBeNull();
  });
});
