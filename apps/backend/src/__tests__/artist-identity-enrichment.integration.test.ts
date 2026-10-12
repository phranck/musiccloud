import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeRepository, getAdminRepository, getRepository } from "../db/index.js";
import type { ArtistIdentitySnapshot, ArtistMembershipSnapshot, PartialDateRecord } from "../db/repository.js";
import { connectRepositoriesToIntegrationDatabase, integrationDatabaseUrl } from "./integration-database.js";

describe.skipIf(!integrationDatabaseUrl())("artist identity enrichment writes (integration)", () => {
  connectRepositoriesToIntegrationDatabase();

  const suffix = Math.random().toString(36).slice(2, 10);
  const groupEntityId = `identity-group-${suffix}`;
  const soloEntityId = `identity-solo-${suffix}`;
  const rivalEntityId = `identity-rival-${suffix}`;
  const mbid = (name: string) => `test-${suffix}-${name}`;
  const createdEntityIds = [groupEntityId, soloEntityId, rivalEntityId];

  let client: pg.Client;

  /** Creates a catalog artist: an entity with a profile and a Spotify link, as a resolved artist page leaves it. */
  async function createCatalogArtist(artistEntityId: string, name: string) {
    await client.query(
      `INSERT INTO artist_entities (id, entity_type, verification_status, created_at, updated_at)
       VALUES ($1, 'unknown', 'candidate', NOW(), NOW())`,
      [artistEntityId],
    );
    await client.query(
      `INSERT INTO artist_entity_names (id, artist_entity_id, name, name_type) VALUES ($1, $2, $3, 'canonical')`,
      [`name-${artistEntityId}`, artistEntityId, name],
    );
    await client.query(
      `INSERT INTO artist_profiles (artist_entity_id, source_service, source_url, created_at, updated_at)
       VALUES ($1, 'spotify', $2, NOW(), NOW())`,
      [artistEntityId, `https://open.spotify.com/artist/${artistEntityId}`],
    );
    await client.query(
      `INSERT INTO artist_service_links (id, artist_entity_id, service, external_id, url, confidence, match_method, created_at)
       VALUES ($1, $2, 'spotify', $3, $4, 1, 'integration-test', NOW())`,
      [`link-${artistEntityId}`, artistEntityId, artistEntityId, `https://open.spotify.com/artist/${artistEntityId}`],
    );
  }

  const year = (value: number): PartialDateRecord => ({
    value: null,
    precision: "year",
    year: value,
    month: null,
    day: null,
  });

  const stint = (
    side: ArtistMembershipSnapshot["side"],
    counterpartName: string,
    begin: number,
    end: number | null,
  ): ArtistMembershipSnapshot => ({
    side,
    counterpart: {
      providerArtistId: mbid(counterpartName),
      name: `${counterpartName} ${suffix}`,
      entityType: side === "member" ? "group" : "person",
    },
    begin: year(begin),
    end: end === null ? null : year(end),
    isCurrent: end === null,
    roles: ["guitar"],
  });

  const snapshot = (
    name: string,
    entityType: ArtistIdentitySnapshot["entityType"],
    memberships: ArtistMembershipSnapshot[],
  ): ArtistIdentitySnapshot => ({
    provider: "musicbrainz",
    providerArtistId: mbid(name),
    sourceUrl: `https://musicbrainz.org/artist/${mbid(name)}`,
    name,
    entityType,
    events: entityType === "group" ? [{ eventType: "formed", date: year(1991) }] : [],
    memberships,
  });

  /** The group's band: Ada played twice, Bo once. */
  const bandSnapshot = snapshot("band", "group", [
    stint("group", "ada", 1991, 1995),
    stint("group", "ada", 2001, null),
    stint("group", "bo", 1991, null),
  ]);

  async function membershipCount(groupId: string) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM artist_group_memberships WHERE group_artist_entity_id = $1`,
      [groupId],
    );
    return Number(result.rows[0]?.count);
  }

  async function entityIdFor(providerArtistId: string) {
    const repo = await getRepository();
    return repo.findArtistEntityIdByIdentifier("musicbrainz", providerArtistId);
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    await createCatalogArtist(groupEntityId, `Band ${suffix}`);
    await createCatalogArtist(soloEntityId, `Ada ${suffix}`);
    await createCatalogArtist(rivalEntityId, `Rival ${suffix}`);
  });

  afterAll(async () => {
    const counterpartIds = await client.query<{ artist_entity_id: string }>(
      `SELECT artist_entity_id FROM artist_entity_identifiers WHERE external_id LIKE $1`,
      [`test-${suffix}-%`],
    );
    await client.query(`DELETE FROM artist_entities WHERE id = ANY($1::text[])`, [
      [...createdEntityIds, ...counterpartIds.rows.map((row) => row.artist_entity_id)],
    ]);
    await client.query(`DELETE FROM artist_sources WHERE provider_entity_id LIKE $1`, [`test-${suffix}-%`]);
    await client.end();
    await closeRepository();
  });

  it("offers a catalog artist with a Spotify link until it has been checked", async () => {
    const repo = await getRepository();
    const due = async () =>
      (
        await repo.listArtistIdentityCandidates({
          limit: 10_000,
          recheckBefore: new Date("2000-01-01"),
          retryFailedBefore: new Date("2000-01-01"),
        })
      ).find((candidate) => candidate.artistEntityId === groupEntityId);

    expect(await due()).toEqual({
      artistEntityId: groupEntityId,
      musicBrainzId: null,
      serviceLinks: [
        { service: "spotify", externalId: groupEntityId, url: `https://open.spotify.com/artist/${groupEntityId}` },
      ],
    });

    await repo.recordArtistIdentityCheck(groupEntityId, "no_match", new Date());
    expect(await due()).toBeUndefined();
  });

  it("records the type, the formation and one membership per stint", async () => {
    const repo = await getRepository();

    await expect(repo.recordArtistIdentity(groupEntityId, bandSnapshot, new Date())).resolves.toBe("matched");

    const entity = await client.query<{ entity_type: string }>(
      `SELECT entity_type FROM artist_entities WHERE id = $1`,
      [groupEntityId],
    );
    expect(entity.rows[0]?.entity_type).toBe("group");
    expect(await membershipCount(groupEntityId)).toBe(3);
    const members = await repo.listArtistGroupMembers(groupEntityId);
    expect(members.map((member) => member.roles)).toEqual([["guitar"], ["guitar"], ["guitar"]]);
    expect(await entityIdFor(mbid("band"))).toBe(groupEntityId);
  });

  it("leaves one row per stint after the band and a member are both fetched, and after a refetch", async () => {
    const repo = await getRepository();
    const adaId = await entityIdFor(mbid("ada"));
    expect(adaId).not.toBeNull();

    // Ada's own answer lists the same two stints, seen from her side.
    await repo.recordArtistIdentity(
      adaId!,
      snapshot("ada", "person", [stint("member", "band", 1991, 1995), stint("member", "band", 2001, null)]),
      new Date(),
    );
    expect(await membershipCount(groupEntityId)).toBe(3);

    await repo.recordArtistIdentity(groupEntityId, bandSnapshot, new Date());
    expect(await membershipCount(groupEntityId)).toBe(3);
  });

  it("folds a member met only through the band into the catalog artist who turns out to be her", async () => {
    const repo = await getRepository();
    const placeholderId = await entityIdFor(mbid("ada"));

    const outcome = await repo.recordArtistIdentity(
      soloEntityId,
      snapshot("ada", "person", [stint("member", "band", 1991, 1995), stint("member", "band", 2001, null)]),
      new Date(),
    );

    expect(outcome).toBe("matched");
    expect(await entityIdFor(mbid("ada"))).toBe(soloEntityId);
    const placeholder = await client.query(`SELECT 1 FROM artist_entities WHERE id = $1`, [placeholderId]);
    expect(placeholder.rowCount).toBe(0);
    const memberships = await repo.listArtistMemberships(soloEntityId);
    expect(memberships.map((membership) => membership.groupArtistEntityId)).toEqual([groupEntityId, groupEntityId]);
    expect(await membershipCount(groupEntityId)).toBe(3);
  });

  it("refuses to give one MusicBrainz artist to a second catalog artist", async () => {
    const repo = await getRepository();

    await expect(repo.recordArtistIdentity(rivalEntityId, bandSnapshot, new Date())).resolves.toBe("conflict");

    expect(await entityIdFor(mbid("band"))).toBe(groupEntityId);
    const check = await client.query<{ outcome: string }>(
      `SELECT outcome FROM artist_identity_checks WHERE artist_entity_id = $1`,
      [rivalEntityId],
    );
    expect(check.rows[0]?.outcome).toBe("conflict");
  });

  it("reads back the month and day of a stint dated to the day", async () => {
    const repo = await getRepository();
    const dated = snapshot("band", "group", [
      {
        ...stint("group", "bo", 1991, null),
        begin: { value: "1991-04-12", precision: "day", year: 1991, month: 4, day: 12 },
      },
    ]);

    await repo.recordArtistIdentity(groupEntityId, dated, new Date());

    const [member] = await repo.listArtistGroupMembers(groupEntityId);
    expect(member).toMatchObject({ beginDatePrecision: "day", beginYear: 1991, beginMonth: 4, beginDay: 12 });
  });

  it("gives the dashboard the entity with every fact and the source that stated it", async () => {
    const adminRepo = await getAdminRepository();

    const entity = await adminRepo.getArtistEntityIdentity(groupEntityId);

    expect(entity).toMatchObject({
      id: groupEntityId,
      name: `Band ${suffix}`,
      entityType: "group",
      hasProfile: true,
      names: [{ name: `Band ${suffix}`, nameType: "canonical", locale: null }],
      events: [
        {
          eventType: "formed",
          datePrecision: "year",
          eventYear: 1991,
          sourceProvider: "musicbrainz",
          sourceUrl: `https://musicbrainz.org/artist/${mbid("band")}`,
          sourceFetchedAt: expect.any(Number),
        },
      ],
      members: [{ memberName: `bo ${suffix}`, sourceProvider: "musicbrainz", sourceFetchedAt: expect.any(Number) }],
      memberOf: [],
    });
    await expect(adminRepo.getArtistEntityIdentity(`identity-missing-${suffix}`)).resolves.toBeNull();
  });
});
