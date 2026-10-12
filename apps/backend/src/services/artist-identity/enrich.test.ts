import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtistIdentityCandidate, ArtistIdentitySnapshot, TrackRepository } from "../../db/repository.js";
import { ResolveError } from "../../lib/resolve/errors.js";
import { artistPageUrls, enrichArtistIdentities, IDENTITY_RECHECK_DAYS } from "./enrich.js";

const musicBrainz = vi.hoisted(() => ({
  findMusicBrainzIdForUrl: vi.fn(),
  fetchMusicBrainzIdentity: vi.fn(),
}));

vi.mock("./musicbrainz-identity.js", () => musicBrainz);

const SNAPSHOT: ArtistIdentitySnapshot = {
  provider: "musicbrainz",
  providerArtistId: "mbid-radiohead",
  sourceUrl: "https://musicbrainz.org/artist/mbid-radiohead",
  name: "Radiohead",
  entityType: "group",
  events: [],
  memberships: [],
};

/** A repository that hands out the given candidates and records what the enrichment writes. */
function fakeRepository(candidates: ArtistIdentityCandidate[]) {
  return {
    listArtistIdentityCandidates: vi.fn().mockResolvedValue(candidates),
    recordArtistIdentity: vi.fn().mockResolvedValue("matched"),
    recordArtistIdentityCheck: vi.fn().mockResolvedValue(undefined),
  };
}

const asRepository = (repo: ReturnType<typeof fakeRepository>) => repo as unknown as TrackRepository;
const NOW = new Date("2026-10-12T12:00:00.000Z");

describe("artistPageUrls", () => {
  it("rebuilds a page from the service's id, in the form MusicBrainz records it", () => {
    expect(
      artistPageUrls([
        {
          service: "spotify",
          externalId: "4Z8W4fKeB5YxbusRsdQVPb",
          url: "https://open.spotify.com/intl-de/artist/x?si=1",
        },
        { service: "deezer", externalId: null, url: "https://www.deezer.com/artist/399" },
      ]),
    ).toEqual(["https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb", "https://www.deezer.com/artist/399"]);
  });
});

describe("enrichArtistIdentities", () => {
  beforeEach(() => {
    musicBrainz.findMusicBrainzIdForUrl.mockReset();
    musicBrainz.fetchMusicBrainzIdentity.mockReset();
  });

  it("asks for the entities that are due and records what MusicBrainz says", async () => {
    const repo = fakeRepository([
      {
        artistEntityId: "entity-radiohead",
        musicBrainzId: null,
        serviceLinks: [{ service: "spotify", externalId: "4Z8W4fKeB5YxbusRsdQVPb", url: "unused" }],
      },
    ]);
    musicBrainz.findMusicBrainzIdForUrl.mockResolvedValue("mbid-radiohead");
    musicBrainz.fetchMusicBrainzIdentity.mockResolvedValue(SNAPSHOT);

    const outcomes = await enrichArtistIdentities(asRepository(repo), NOW, 5);

    expect(repo.listArtistIdentityCandidates).toHaveBeenCalledWith({
      limit: 5,
      recheckBefore: new Date(NOW.getTime() - IDENTITY_RECHECK_DAYS * 24 * 60 * 60 * 1000),
      retryFailedBefore: new Date("2026-10-11T12:00:00.000Z"),
    });
    expect(musicBrainz.findMusicBrainzIdForUrl).toHaveBeenCalledWith(
      "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb",
    );
    expect(repo.recordArtistIdentity).toHaveBeenCalledWith("entity-radiohead", SNAPSHOT, NOW);
    expect(outcomes).toEqual({ matched: 1, no_match: 0, conflict: 0, failed: 0 });
  });

  it("uses the MusicBrainz id an entity already carries without asking about its pages", async () => {
    const repo = fakeRepository([{ artistEntityId: "entity-thom", musicBrainzId: "mbid-thom", serviceLinks: [] }]);
    musicBrainz.fetchMusicBrainzIdentity.mockResolvedValue({ ...SNAPSHOT, providerArtistId: "mbid-thom" });

    await enrichArtistIdentities(asRepository(repo), NOW);

    expect(musicBrainz.findMusicBrainzIdForUrl).not.toHaveBeenCalled();
    expect(musicBrainz.fetchMusicBrainzIdentity).toHaveBeenCalledWith("mbid-thom");
  });

  it("records an artist MusicBrainz does not know as unmatched, without a name search", async () => {
    const repo = fakeRepository([
      {
        artistEntityId: "entity-unknown",
        musicBrainzId: null,
        serviceLinks: [
          { service: "spotify", externalId: "spotify-id", url: "unused" },
          { service: "deezer", externalId: "deezer-id", url: "unused" },
        ],
      },
    ]);
    musicBrainz.findMusicBrainzIdForUrl.mockResolvedValue(null);

    const outcomes = await enrichArtistIdentities(asRepository(repo), NOW);

    expect(musicBrainz.findMusicBrainzIdForUrl).toHaveBeenCalledTimes(2);
    expect(musicBrainz.fetchMusicBrainzIdentity).not.toHaveBeenCalled();
    expect(repo.recordArtistIdentityCheck).toHaveBeenCalledWith("entity-unknown", "no_match", NOW);
    expect(outcomes.no_match).toBe(1);
  });

  it("records a failed check and carries on with the next artist", async () => {
    const repo = fakeRepository([
      { artistEntityId: "entity-failing", musicBrainzId: "mbid-failing", serviceLinks: [] },
      { artistEntityId: "entity-fine", musicBrainzId: "mbid-fine", serviceLinks: [] },
    ]);
    musicBrainz.fetchMusicBrainzIdentity
      .mockRejectedValueOnce(new ResolveError("MC-API-9601", "MusicBrainz artist fetch failed: 500"))
      .mockResolvedValueOnce(SNAPSHOT);

    const outcomes = await enrichArtistIdentities(asRepository(repo), NOW);

    expect(repo.recordArtistIdentityCheck).toHaveBeenCalledWith("entity-failing", "failed", NOW);
    expect(repo.recordArtistIdentity).toHaveBeenCalledWith("entity-fine", SNAPSHOT, NOW);
    expect(outcomes).toEqual({ matched: 1, no_match: 0, conflict: 0, failed: 1 });
  });
});
