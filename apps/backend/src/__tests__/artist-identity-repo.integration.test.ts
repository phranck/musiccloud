import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRepository, getRepository } from "../db/index.js";

describe.skipIf(!process.env.DATABASE_URL)("artist identity repository (integration)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const sourceId = `artist-source-${suffix}`;
  const groupId = `artist-entity-group-${suffix}`;
  const memberId = `artist-entity-member-${suffix}`;
  const outsiderId = `artist-entity-outsider-${suffix}`;
  const placeId = `place-${suffix}`;
  const membershipId = `membership-${suffix}`;
  const trackId = `track-artist-identity-${suffix}`;
  const creditId = `track-credit-${suffix}`;
  const formedEventId = `event-formed-${suffix}`;
  const birthEventId = `event-birth-${suffix}`;
  const outsiderBirthEventId = `event-outsider-birth-${suffix}`;
  const creditTrackSourceUrl = `https://example.test/credit-track/${suffix}`;
  const creditArtistOne = `Credit Artist One ${suffix}`;
  const creditArtistTwo = `Credit Artist Two ${suffix}`;

  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    await client.query(
      `INSERT INTO artist_sources (id, provider, provider_entity_id, source_url, confidence)
       VALUES ($1, 'manual', $2, $3, 1)`,
      [sourceId, `manual-${suffix}`, `https://example.test/${suffix}`],
    );
    await client.query(
      `INSERT INTO artist_entities (id, entity_type, verification_status, confidence)
       VALUES
         ($1, 'group', 'verified', 1),
         ($2, 'person', 'verified', 1),
         ($3, 'person', 'verified', 1)`,
      [groupId, memberId, outsiderId],
    );
    await client.query(
      `INSERT INTO artist_entity_names (id, artist_entity_id, locale, name, name_type, source_id)
       VALUES
         ($1, $2, 'en', 'Integration Test Band', 'canonical', $7),
         ($3, $4, 'en', 'Integration Test Member', 'canonical', $7),
         ($5, $6, 'en', 'Integration Test Outsider', 'canonical', $7)`,
      [
        `name-group-${suffix}`,
        groupId,
        `name-member-${suffix}`,
        memberId,
        `name-outsider-${suffix}`,
        outsiderId,
        sourceId,
      ],
    );
    await client.query(`INSERT INTO places (id, country_code) VALUES ($1, 'GB')`, [placeId]);
    await client.query(
      `INSERT INTO place_names (id, place_id, locale, name, source_id)
       VALUES ($1, $2, 'en', 'Basildon', $3)`,
      [`place-name-${suffix}`, placeId, sourceId],
    );
    await client.query(
      `INSERT INTO artist_entity_events (
         id, artist_entity_id, event_type, date_value, date_precision,
         event_year, event_month, event_day, place_id, source_id, confidence
       )
       VALUES
         ($1, $2, 'formed', '1980-03-14', 'day', 1980, 3, 14, $7, $8, 1),
         ($3, $4, 'birth', '1962-05-09', 'day', 1962, 5, 9, $7, $8, 1),
         ($5, $6, 'birth', '1970-05-09', 'day', 1970, 5, 9, NULL, $8, 1)`,
      [formedEventId, groupId, birthEventId, memberId, outsiderBirthEventId, outsiderId, placeId, sourceId],
    );
    await client.query(
      `INSERT INTO artist_entity_identifiers (id, artist_entity_id, provider, external_id, external_url, source_id)
       VALUES ($1, $2, 'wikidata', $3, $4, $5)`,
      [`identifier-${suffix}`, memberId, `Q${suffix}`, `https://www.wikidata.org/wiki/Q${suffix}`, sourceId],
    );
    await client.query(
      `INSERT INTO artist_group_memberships (
         id, group_artist_entity_id, member_artist_entity_id, member_name_credit,
         begin_date, begin_date_precision, begin_year, is_current, source_id, confidence
       )
       VALUES ($1, $2, $3, 'Integration Test Member', '1980-03-14', 'day', 1980, true, $4, 1)`,
      [membershipId, groupId, memberId, sourceId],
    );
    await client.query(
      `INSERT INTO artist_group_membership_roles (membership_id, role)
       VALUES ($1, 'vocalist'), ($1, 'keyboardist')`,
      [membershipId],
    );
    await client.query(
      `INSERT INTO tracks (
         id, title, source_service, source_url, created_at, updated_at
       )
       VALUES ($1, 'Identity Integration Track', 'manual', $2, NOW(), NOW())`,
      [trackId, `https://example.test/track/${suffix}`],
    );
    await client.query(
      `INSERT INTO track_artist_credits (
         id, track_id, artist_entity_id, credit_name, credit_position, credit_role, confidence, match_method, source_id
       )
       VALUES ($1, $2, $3, 'Integration Test Band', 0, 'main', 1, 'integration-test', $4)`,
      [creditId, trackId, groupId, sourceId],
    );
  });

  afterAll(async () => {
    await client.query(`DELETE FROM service_links WHERE track_id IN (SELECT id FROM tracks WHERE source_url = $1)`, [
      creditTrackSourceUrl,
    ]);
    await client.query(`DELETE FROM short_urls WHERE track_id IN (SELECT id FROM tracks WHERE source_url = $1)`, [
      creditTrackSourceUrl,
    ]);
    await client.query(`DELETE FROM tracks WHERE source_url = $1`, [creditTrackSourceUrl]);
    await client.query(
      `DELETE FROM artist_entities
       WHERE id IN (
         SELECT artist_entity_id FROM artist_entity_names WHERE name = ANY($1::text[])
       )`,
      [[creditArtistOne, creditArtistTwo]],
    );
    await client.query(`DELETE FROM tracks WHERE id = $1`, [trackId]);
    await client.query(`DELETE FROM artist_entities WHERE id = ANY($1::text[])`, [[groupId, memberId, outsiderId]]);
    await client.query(`DELETE FROM places WHERE id = $1`, [placeId]);
    await client.query(`DELETE FROM artist_sources WHERE id = $1`, [sourceId]);
    await client.end();
    await closeRepository();
  });

  it("finds catalog-relevant member birthdays through credited groups", async () => {
    const repo = await getRepository();
    const events = await repo.listArtistIdentityEventsByDay({
      month: 5,
      day: 9,
      locale: "en",
      eventTypes: ["birth"],
      catalogOnly: true,
    });

    expect(events.some((event) => event.artistEntityId === memberId)).toBe(true);
    expect(events.some((event) => event.artistEntityId === outsiderId)).toBe(false);
    expect(events.find((event) => event.artistEntityId === memberId)?.placeName).toBe("Basildon");
  });

  it("finds group formation anniversaries for credited bands", async () => {
    const repo = await getRepository();
    const events = await repo.listArtistIdentityEventsByDay({
      month: 3,
      day: 14,
      locale: "en",
      eventTypes: ["formed"],
      catalogOnly: true,
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artistEntityId: groupId,
          displayName: "Integration Test Band",
          eventType: "formed",
          eventYear: 1980,
        }),
      ]),
    );
  });

  it("returns normalized group members and member memberships with roles", async () => {
    const repo = await getRepository();

    const members = await repo.listArtistGroupMembers(groupId, "en");
    expect(members).toEqual([
      expect.objectContaining({
        membershipId,
        groupArtistEntityId: groupId,
        groupName: "Integration Test Band",
        memberArtistEntityId: memberId,
        memberName: "Integration Test Member",
        roles: ["keyboardist", "vocalist"],
        isCurrent: true,
      }),
    ]);

    const memberships = await repo.listArtistMemberships(memberId, "en");
    expect(memberships[0]?.groupArtistEntityId).toBe(groupId);
  });

  it("looks up artist entities by provider identifier", async () => {
    const repo = await getRepository();
    await expect(repo.findArtistEntityIdByIdentifier("wikidata", `Q${suffix}`)).resolves.toBe(memberId);
    await expect(repo.findArtistEntityIdByIdentifier("wikidata", `missing-${suffix}`)).resolves.toBeNull();
  });

  it("persists and reads track artist display names through credits", async () => {
    const repo = await getRepository();

    await repo.persistTrackWithLinks({
      sourceTrack: {
        title: "Credit Backed Track",
        artists: [creditArtistOne, creditArtistTwo],
        sourceService: "manual",
        sourceUrl: creditTrackSourceUrl,
      },
      links: [{ service: "manual", url: creditTrackSourceUrl, confidence: 1, matchMethod: "integration-test" }],
    });

    const cached = await repo.findTrackByUrl(creditTrackSourceUrl);
    expect(cached?.track.artists).toEqual([creditArtistOne, creditArtistTwo]);
  });
});
