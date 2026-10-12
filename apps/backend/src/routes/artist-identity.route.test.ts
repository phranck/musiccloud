import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtistGroupMembershipRecord, ArtistIdentityEventRecord } from "../db/repository.js";
import { OPENAPI_SCHEMAS } from "../schemas/openapi-schemas.js";

const repository = vi.hoisted(() => ({
  listArtistIdentityEventsByDay: vi.fn(),
  listArtistGroupMembers: vi.fn(),
  listArtistMemberships: vi.fn(),
  findArtistInfoEntity: vi.fn(),
}));

vi.mock("../db/index.js", () => ({ getRepository: async () => repository }));

vi.mock("../lib/infra/rate-limiter.js", () => ({
  apiRateLimiter: { check: vi.fn().mockReturnValue({ limited: false }) },
}));

const { default: artistIdentityRoutes } = await import("./artist-identity.js");

/** The route plugin on its own, with the real response schemas, so serialization drops what they do not name. */
function buildRouteApp() {
  const app = Fastify({ ajv: { customOptions: { keywords: ["example"] } } });
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    required: ["error"],
    properties: { error: { type: "string" }, message: { type: "string" }, errorId: { type: "string" } },
  });
  for (const schema of OPENAPI_SCHEMAS) app.addSchema(schema);
  app.register(artistIdentityRoutes);
  return app;
}

const BIRTH: ArtistIdentityEventRecord = {
  eventId: "event-1",
  artistEntityId: "artist-thom",
  entityType: "person",
  verificationStatus: "candidate",
  displayName: "Thom Yorke",
  eventType: "birth",
  dateValue: "1968-10-07",
  datePrecision: "day",
  eventYear: 1968,
  eventMonth: 10,
  eventDay: 7,
  placeName: null,
  countryCode: null,
  sourceProvider: "musicbrainz",
  sourceUrl: "https://musicbrainz.org/artist/8ed2e0b3-aa4c-4e13-bec3-dc7393ed4d6b",
  confidence: 0.9,
};

const membership = (overrides: Partial<ArtistGroupMembershipRecord>): ArtistGroupMembershipRecord => ({
  membershipId: "membership-1",
  groupArtistEntityId: "artist-radiohead",
  groupName: "Radiohead",
  memberArtistEntityId: "artist-thom",
  memberName: "Thom Yorke",
  memberNameCredit: null,
  roles: ["lead vocals"],
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
  ...overrides,
});

describe("GET /api/v1/artists/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads catalog events of every type for the day and answers without provenance", async () => {
    repository.listArtistIdentityEventsByDay.mockResolvedValue([BIRTH]);
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artists/events?month=10&day=7" });

    expect(response.statusCode).toBe(200);
    expect(repository.listArtistIdentityEventsByDay).toHaveBeenCalledWith({
      month: 10,
      day: 7,
      eventTypes: ["birth", "death", "formed", "disbanded"],
      catalogOnly: true,
    });
    expect(response.json()).toEqual({
      month: 10,
      day: 7,
      events: [
        {
          artistEntityId: "artist-thom",
          artistName: "Thom Yorke",
          artistType: "person",
          eventType: "birth",
          date: { precision: "day", year: 1968, month: 10, day: 7 },
        },
      ],
    });
    expect(response.body).not.toMatch(/musicbrainz|confidence|sourceUrl|verification/i);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    await app.close();
  });

  it("filters by one or several event types", async () => {
    repository.listArtistIdentityEventsByDay.mockResolvedValue([]);
    const app = buildRouteApp();

    await app.inject({ method: "GET", url: "/api/v1/artists/events?month=3&day=14&eventType=formed" });
    await app.inject({ method: "GET", url: "/api/v1/artists/events?month=3&day=14&eventType=birth&eventType=death" });

    expect(repository.listArtistIdentityEventsByDay.mock.calls.map(([params]) => params.eventTypes)).toEqual([
      ["formed"],
      ["birth", "death"],
    ]);
    await app.close();
  });

  it.each([
    "/api/v1/artists/events?day=7",
    "/api/v1/artists/events?month=13&day=7",
    "/api/v1/artists/events?month=10&day=0",
    "/api/v1/artists/events?month=10&day=7&eventType=wedding",
  ])("refuses %s", async (url) => {
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(400);
    expect(repository.listArtistIdentityEventsByDay).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("GET /api/v1/artists/:artistEntityId/members and /memberships", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findArtistInfoEntity.mockResolvedValue({ artistEntityId: "artist-radiohead", artistName: "Radiohead" });
  });

  it("lists a group's members once per stint with every role", async () => {
    repository.listArtistGroupMembers.mockResolvedValue([
      membership({ membershipId: "membership-1", roles: ["lead vocals"] }),
      membership({ membershipId: "membership-2", roles: ["guitar"] }),
      membership({
        membershipId: "membership-3",
        beginDatePrecision: "month",
        beginYear: 2001,
        beginMonth: 4,
        isCurrent: false,
        endDatePrecision: "day",
        endDate: "2003-05-06",
        endYear: 2003,
        endMonth: 5,
        endDay: 6,
      }),
    ]);
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artists/artist-radiohead/members" });

    expect(response.statusCode).toBe(200);
    expect(repository.listArtistGroupMembers).toHaveBeenCalledWith("artist-radiohead");
    const { memberships } = response.json();
    expect(memberships).toHaveLength(2);
    expect(memberships[0]).toEqual({
      groupArtistEntityId: "artist-radiohead",
      groupName: "Radiohead",
      memberArtistEntityId: "artist-thom",
      memberName: "Thom Yorke",
      roles: ["guitar", "lead vocals"],
      begin: { precision: "year", year: 1985, month: null, day: null },
      end: null,
      isCurrent: true,
    });
    expect(memberships[1]).toMatchObject({
      begin: { precision: "month", year: 2001, month: 4, day: null },
      end: { precision: "day", year: 2003, month: 5, day: 6 },
      isCurrent: false,
    });
    expect(response.body).not.toMatch(/musicbrainz|confidence|sourceUrl|membershipId/i);
    await app.close();
  });

  it("lists the groups an artist belongs to", async () => {
    repository.listArtistMemberships.mockResolvedValue([membership({})]);
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artists/artist-thom/memberships" });

    expect(response.statusCode).toBe(200);
    expect(repository.listArtistMemberships).toHaveBeenCalledWith("artist-thom");
    expect(response.json()).toMatchObject({ artistEntityId: "artist-thom", memberships: [{ groupName: "Radiohead" }] });
    await app.close();
  });

  it("answers an artist without memberships with an empty list", async () => {
    repository.listArtistMemberships.mockResolvedValue([]);
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artists/artist-thom/memberships" });

    expect(response.json()).toEqual({ artistEntityId: "artist-thom", memberships: [] });
    await app.close();
  });

  it("answers an unknown artist with 404", async () => {
    repository.findArtistInfoEntity.mockResolvedValue(null);
    const app = buildRouteApp();

    const response = await app.inject({ method: "GET", url: "/api/v1/artists/artist-nobody/members" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("MC-RES-0003");
    expect(repository.listArtistGroupMembers).not.toHaveBeenCalled();
    await app.close();
  });
});
