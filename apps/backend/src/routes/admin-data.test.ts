import { type AdminArtistListItem, ENDPOINTS } from "@musiccloud/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistEntityIdentityRecord } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import type { ArtistGroupMembershipRecord } from "../db/repository.js";
import { registerApiErrorHandling } from "../lib/infra/api-error-handler.js";
import adminDataRoutes from "./admin-data.js";

const mockAdminRepository = {
  listArtists: vi.fn(),
  getArtistEntityIdentity: vi.fn(),
};

const MEMBERSHIP: ArtistGroupMembershipRecord = {
  membershipId: "membership-1",
  groupArtistEntityId: "artist-radiohead",
  groupName: "Radiohead",
  memberArtistEntityId: "artist-thom",
  memberName: "Thom Yorke",
  memberNameCredit: null,
  roles: ["piano", "lead vocals"],
  beginDate: null,
  beginDatePrecision: "year",
  beginYear: 1985,
  beginMonth: null,
  beginDay: null,
  endDate: null,
  endDatePrecision: "unknown",
  endYear: null,
  endMonth: null,
  endDay: null,
  isCurrent: true,
  sourceProvider: "musicbrainz",
  sourceUrl: "https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711",
  sourceFetchedAt: 1_760_000_000_000,
  confidence: 0.9,
};

const ENTITY: ArtistEntityIdentityRecord = {
  id: "artist-radiohead",
  name: "Radiohead",
  entityType: "group",
  verificationStatus: "candidate",
  hasProfile: true,
  shortId: "radiohead",
  createdAt: 1_700_000_000_000,
  names: [{ id: "name-1", name: "Radiohead", nameType: "canonical", locale: null }],
  events: [
    {
      id: "event-1",
      eventType: "formed",
      datePrecision: "year",
      eventYear: 1985,
      eventMonth: 4,
      eventDay: null,
      sourceProvider: "musicbrainz",
      sourceUrl: "https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711",
      sourceFetchedAt: 1_760_000_000_000,
    },
  ],
  members: [MEMBERSHIP, { ...MEMBERSHIP, membershipId: "membership-2", sourceProvider: null, sourceUrl: null }],
  memberOf: [],
};

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(async () => mockAdminRepository),
  getApiAccessRepository: vi.fn(),
}));

const ARTIST: AdminArtistListItem = {
  id: "artist-1",
  artistEntityId: "artist-1",
  name: "Slowdive",
  imageUrl: null,
  genres: ["dream pop"],
  sourceService: "deezer",
  linkCount: 2,
  createdAt: 1_700_000_000_000,
  shortId: "slowdive",
  profileCache: {
    state: "failed",
    profileUpdatedAt: "2026-01-01T00:00:00.000Z",
    ageMs: 1000,
    providers: ["spotify", "lastfm"],
    latestManualRefresh: {
      trigger: "manual",
      occurredAt: "2026-07-19T20:00:00.000Z",
      completedAt: "2026-07-19T20:00:05.000Z",
      outcome: "failed",
      errorCode: "MC-API-0001",
      errorId: "error-38",
    },
  },
};

let app: FastifyInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  mockAdminRepository.listArtists.mockResolvedValue({ items: [ARTIST], total: 1, page: 1, limit: 20 });
  app = Fastify();
  registerApiErrorHandling(app);
  await app.register(adminDataRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("GET /api/admin/artists", () => {
  it("returns the shared artist profile-cache contract unchanged", async () => {
    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artists.list });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [ARTIST], total: 1, page: 1, limit: 20 });
    expect(getAdminRepository).toHaveBeenCalledTimes(1);
    expect(mockAdminRepository.listArtists).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
      sortBy: undefined,
      sortDir: undefined,
    });
  });

  it("preserves canonical database errors when the projection fails", async () => {
    mockAdminRepository.listArtists.mockRejectedValueOnce(
      Object.assign(new Error("database unavailable"), {
        code: "08006",
      }),
    );

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artists.list });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "MC-DB-0003",
      errorId: expect.any(String),
      message: expect.any(String),
    });
  });
});

describe("GET /api/admin/artist-entities/:id", () => {
  it("answers each fact in its public shape with the source that stated it", async () => {
    mockAdminRepository.getArtistEntityIdentity.mockResolvedValue(ENTITY);

    const response = await app.inject({
      method: "GET",
      url: ENDPOINTS.admin.artistEntities.detail("artist-radiohead"),
    });

    expect(response.statusCode).toBe(200);
    expect(mockAdminRepository.getArtistEntityIdentity).toHaveBeenCalledWith("artist-radiohead");
    const source = {
      provider: "musicbrainz",
      url: "https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711",
      fetchedAt: 1_760_000_000_000,
    };
    expect(response.json()).toEqual({
      id: "artist-radiohead",
      name: "Radiohead",
      entityType: "group",
      verificationStatus: "candidate",
      hasProfile: true,
      shortId: "radiohead",
      createdAt: 1_700_000_000_000,
      names: [{ id: "name-1", name: "Radiohead", nameType: "canonical", locale: null }],
      events: [
        { id: "event-1", eventType: "formed", date: { precision: "year", year: 1985, month: null, day: null }, source },
      ],
      members: [
        {
          id: "membership-1",
          groupArtistEntityId: "artist-radiohead",
          groupName: "Radiohead",
          memberArtistEntityId: "artist-thom",
          memberName: "Thom Yorke",
          roles: ["lead vocals", "piano"],
          begin: { precision: "year", year: 1985, month: null, day: null },
          end: null,
          isCurrent: true,
          source,
        },
        expect.objectContaining({ id: "membership-2", source: null }),
      ],
      memberOf: [],
    });
    expect(response.body).not.toMatch(/confidence/);
  });

  it("answers an unknown entity with 404", async () => {
    mockAdminRepository.getArtistEntityIdentity.mockResolvedValue(null);

    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artistEntities.detail("artist-nobody") });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
  });

  it("refuses a malformed id before reading anything", async () => {
    const response = await app.inject({ method: "GET", url: ENDPOINTS.admin.artistEntities.detail("not an id") });

    expect(response.statusCode).toBe(400);
    expect(mockAdminRepository.getArtistEntityIdentity).not.toHaveBeenCalled();
  });
});
