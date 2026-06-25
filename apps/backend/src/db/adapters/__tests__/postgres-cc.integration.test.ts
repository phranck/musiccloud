import * as pgModule from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getCcRepository } from "../../index.js";
import type { PersistCcAlbumData, PersistCcArtistData, PersistCcTrackData } from "../../repository.js";

/**
 * Hits a live Postgres pointed at by `DATABASE_URL`. Exercises the slim CC
 * repository (`persistCcTrack` / `persistCcAlbum` / `persistCcArtist` /
 * `findCcShortId` plus the share-page reads `loadCc{Track,Album,Artist}ByShortId`)
 * against the `cc_*` tables (migration 0043, the `cc_album_short_urls` /
 * `cc_artist_short_urls` tables from migration 0044, and the track detail /
 * position columns from migration 0045).
 *
 * Every fixture uses a random `jamendoId` per run so it never collides with
 * seeded data or a previous run. afterAll deletes every row it created in
 * FK-dependency order (short-url children first, then tracks/albums/artists),
 * because the CC FKs are `ON DELETE no action`.
 */
describe.skipIf(!process.env.DATABASE_URL)("CC repository (integration)", () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const jamendoTrackId = `ittrk-${suffix}`;
  const jamendoArtistId = `itart-${suffix}`;
  const jamendoAlbumId = `italb-${suffix}`;

  // Independent ids for the standalone album / artist resolve fixtures so their
  // teardown never races the track fixture's shared artist/album.
  const jamendoAlbumOnlyId = `italbo-${suffix}`;
  const jamendoAlbumOnlyArtistId = `italba-${suffix}`;
  const jamendoArtistOnlyId = `itarto-${suffix}`;

  // Tracklist / top-track ids persisted alongside the album / artist resolves.
  const jamendoAlbumTrackIds = [`italbtrk0-${suffix}`, `italbtrk1-${suffix}`];
  const jamendoArtistTrackIds = [`itarttrk0-${suffix}`, `itarttrk1-${suffix}`];
  const allTrackIds = [jamendoTrackId, ...jamendoAlbumTrackIds, ...jamendoArtistTrackIds];

  const albumTracks: PersistCcTrackData[] = jamendoAlbumTrackIds.map((id, i) => ({
    jamendoId: id,
    title: `CC Album Track ${i + 1}`,
    artistName: "CC Integration Album Artist",
    jamendoArtistId: jamendoAlbumOnlyArtistId,
    streamUrl: `https://prod.storage.jamendo.com/?trackid=${id}&format=mp31`,
    downloadAllowed: false,
    albumPosition: i + 1,
  }));

  const artistTopTracks: PersistCcTrackData[] = jamendoArtistTrackIds.map((id, i) => ({
    jamendoId: id,
    title: `CC Artist Top Track ${i + 1}`,
    artistName: "CC Integration Artist (artist resolve)",
    jamendoArtistId: jamendoArtistOnlyId,
    streamUrl: `https://prod.storage.jamendo.com/?trackid=${id}&format=mp31`,
    downloadAllowed: false,
    artistTopPosition: i,
  }));

  const albumFixture: PersistCcAlbumData = {
    jamendoId: jamendoAlbumOnlyId,
    name: "CC Integration Album (album resolve)",
    jamendoArtistId: jamendoAlbumOnlyArtistId,
    artistName: "CC Integration Album Artist",
    artworkUrl: "https://usercontent.jamendo.com/album2.jpg",
    releaseDate: "2021-02-02",
    zipUrl: "https://prod.storage.jamendo.com/download/album2.zip",
    shareUrl: "https://www.jamendo.com/album/italbo",
    tracks: albumTracks,
  };

  const artistFixture: PersistCcArtistData = {
    jamendoId: jamendoArtistOnlyId,
    name: "CC Integration Artist (artist resolve)",
    imageUrl: "https://usercontent.jamendo.com/artist2.jpg",
    website: "https://example.test/artist2",
    shareUrl: "https://www.jamendo.com/artist/itarto",
    topTracks: artistTopTracks,
  };

  const fixture: PersistCcTrackData = {
    jamendoId: jamendoTrackId,
    title: "CC Integration Title",
    artistName: "CC Integration Artist",
    jamendoArtistId,
    artistImageUrl: "https://usercontent.jamendo.com/artist.jpg",
    artistWebsite: "https://example.test/artist",
    artistShareUrl: "https://www.jamendo.com/artist/itart",
    albumName: "CC Integration Album",
    jamendoAlbumId,
    albumArtworkUrl: "https://usercontent.jamendo.com/album.jpg",
    albumReleaseDate: "2020-01-01",
    albumZipUrl: "https://prod.storage.jamendo.com/download/album.zip",
    albumShareUrl: "https://www.jamendo.com/album/italb",
    artworkUrl: "https://usercontent.jamendo.com/track.jpg",
    durationMs: 180000,
    releaseDate: "2020-01-01",
    licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
    streamUrl: `https://prod.storage.jamendo.com/?trackid=${jamendoTrackId}&format=mp31`,
    downloadUrl: `https://prod.storage.jamendo.com/download/track/${jamendoTrackId}`,
    downloadAllowed: true,
    waveform: '{"peaks":[0.1,0.5,0.9]}',
    shareUrl: `https://www.jamendo.com/track/${jamendoTrackId}`,
    musicInfo: { genres: ["rock"], instruments: ["guitar"], vartags: [], vocalInstrumental: "vocal" },
    stats: { listens: 42, downloads: 3, playlisted: 1, favorited: 2, likes: 5, dislikes: 0, avgNote: 4, notes: 7 },
    proLicensing: true,
    proUrl: `https://licensing.jamendo.com/track/${jamendoTrackId}`,
  };

  let pool: pgModule.Pool;

  beforeAll(() => {
    pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    // FK-safe teardown: children first, parents last (CC FKs are no-action).
    await pool.query(
      `DELETE FROM cc_short_urls WHERE cc_track_id IN (SELECT id FROM cc_tracks WHERE jamendo_id = ANY($1))`,
      [allTrackIds],
    );
    await pool.query(`DELETE FROM cc_tracks WHERE jamendo_id = ANY($1)`, [allTrackIds]);
    await pool.query(
      `DELETE FROM cc_album_short_urls WHERE cc_album_id IN (SELECT id FROM cc_albums WHERE jamendo_id = ANY($1))`,
      [[jamendoAlbumId, jamendoAlbumOnlyId]],
    );
    await pool.query(`DELETE FROM cc_albums WHERE jamendo_id = ANY($1)`, [[jamendoAlbumId, jamendoAlbumOnlyId]]);
    await pool.query(
      `DELETE FROM cc_artist_short_urls WHERE cc_artist_id IN (SELECT id FROM cc_artists WHERE jamendo_id = ANY($1))`,
      [[jamendoArtistOnlyId, jamendoAlbumOnlyArtistId, jamendoArtistId]],
    );
    await pool.query(`DELETE FROM cc_artists WHERE jamendo_id = ANY($1)`, [
      [jamendoArtistId, jamendoAlbumOnlyArtistId, jamendoArtistOnlyId],
    ]);
    await pool.end();
  });

  it("persistCcTrack creates track, artist, album and short-url rows", async () => {
    const repo = await getCcRepository();
    const { ccTrackId, shortId } = await repo.persistCcTrack(fixture);

    expect(ccTrackId).toBeTruthy();
    expect(shortId).toBeTruthy();
    expect(shortId.length).toBeGreaterThan(0);

    const track = await pool.query(`SELECT id, cc_artist_id, cc_album_id FROM cc_tracks WHERE jamendo_id = $1`, [
      jamendoTrackId,
    ]);
    expect(track.rows).toHaveLength(1);
    expect(track.rows[0].id).toBe(ccTrackId);

    const artist = await pool.query(`SELECT id FROM cc_artists WHERE jamendo_id = $1`, [jamendoArtistId]);
    expect(artist.rows).toHaveLength(1);
    expect(track.rows[0].cc_artist_id).toBe(artist.rows[0].id);

    const album = await pool.query(`SELECT id FROM cc_albums WHERE jamendo_id = $1`, [jamendoAlbumId]);
    expect(album.rows).toHaveLength(1);
    expect(track.rows[0].cc_album_id).toBe(album.rows[0].id);

    const short = await pool.query(`SELECT id FROM cc_short_urls WHERE cc_track_id = $1`, [ccTrackId]);
    expect(short.rows).toHaveLength(1);
    expect(short.rows[0].id).toBe(shortId);
  });

  it("re-persisting the same jamendoId keeps the same ccTrackId and shortId", async () => {
    const repo = await getCcRepository();
    const first = await repo.persistCcTrack(fixture);
    const second = await repo.persistCcTrack({ ...fixture, title: "CC Integration Title (re-resolved)" });

    expect(second.ccTrackId).toBe(first.ccTrackId);
    expect(second.shortId).toBe(first.shortId);

    // No duplicate short-url row got minted for the stable track.
    const short = await pool.query(`SELECT id FROM cc_short_urls WHERE cc_track_id = $1`, [first.ccTrackId]);
    expect(short.rows).toHaveLength(1);
  });

  it("loadCcTrackByShortId returns the full share row incl. jamendoArtistId and the detail fields", async () => {
    const repo = await getCcRepository();
    const { shortId } = await repo.persistCcTrack(fixture);

    const row = await repo.loadCcTrackByShortId(shortId);
    expect(row).not.toBeNull();
    expect(row!.jamendoId).toBe(jamendoTrackId);
    expect(row!.jamendoArtistId).toBe(jamendoArtistId);
    expect(row!.streamUrl).toBe(fixture.streamUrl);
    // integer 0/1 column round-trips as a number; the mapper coerces it to bool.
    expect(row!.downloadAllowed).toBe(1);
    expect(row!.proLicensing).toBe(1);
    // jsonb round-trips already parsed.
    expect(row!.musicInfo).toMatchObject({ genres: ["rock"] });
    expect(row!.stats).toMatchObject({ listens: 42 });
  });

  it("loadCcTrackByShortId returns null for an unknown short id", async () => {
    const repo = await getCcRepository();
    expect(await repo.loadCcTrackByShortId(`nope-${suffix}`)).toBeNull();
  });

  it("findCcShortId resolves a track short id to its kind and Jamendo id", async () => {
    const repo = await getCcRepository();
    const { shortId } = await repo.persistCcTrack(fixture);

    const lookup = await repo.findCcShortId(shortId);
    expect(lookup).not.toBeNull();
    expect(lookup!.kind).toBe("cc-track");
    expect(lookup!.jamendoId).toBe(jamendoTrackId);
  });

  it("findCcShortId returns null for an unknown short id", async () => {
    const repo = await getCcRepository();
    const lookup = await repo.findCcShortId(`nope-${suffix}`);
    expect(lookup).toBeNull();
  });

  it("persistCcAlbum stores the tracklist and loadCcAlbumByShortId reads it in album_position order", async () => {
    const repo = await getCcRepository();
    const { ccAlbumId, shortId } = await repo.persistCcAlbum(albumFixture);
    expect(ccAlbumId).toBeTruthy();
    expect(shortId).toBeTruthy();

    const album = await pool.query(`SELECT id, cc_artist_id FROM cc_albums WHERE jamendo_id = $1`, [
      jamendoAlbumOnlyId,
    ]);
    expect(album.rows).toHaveLength(1);
    expect(album.rows[0].id).toBe(ccAlbumId);

    // The tracklist rows were persisted against the album.
    const tracks = await pool.query(`SELECT jamendo_id FROM cc_tracks WHERE cc_album_id = $1`, [ccAlbumId]);
    expect(tracks.rows).toHaveLength(jamendoAlbumTrackIds.length);

    const loaded = await repo.loadCcAlbumByShortId(shortId);
    expect(loaded).not.toBeNull();
    expect(loaded!.album.jamendoId).toBe(jamendoAlbumOnlyId);
    expect(loaded!.album.jamendoArtistId).toBe(jamendoAlbumOnlyArtistId);
    expect(loaded!.tracks.map((t) => t.jamendoId)).toEqual(jamendoAlbumTrackIds);

    // Re-resolving keeps the stable id and mints no duplicate short-url.
    const second = await repo.persistCcAlbum({ ...albumFixture, name: "CC Integration Album (re-resolved)" });
    expect(second.ccAlbumId).toBe(ccAlbumId);
    expect(second.shortId).toBe(shortId);
    const shortAfter = await pool.query(`SELECT id FROM cc_album_short_urls WHERE cc_album_id = $1`, [ccAlbumId]);
    expect(shortAfter.rows).toHaveLength(1);
  });

  it("persistCcArtist stores the top tracks and loadCcArtistByShortId reads them in rank order", async () => {
    const repo = await getCcRepository();
    const { ccArtistId, shortId } = await repo.persistCcArtist(artistFixture);
    expect(ccArtistId).toBeTruthy();
    expect(shortId).toBeTruthy();

    const artist = await pool.query(`SELECT id, image_url FROM cc_artists WHERE jamendo_id = $1`, [
      jamendoArtistOnlyId,
    ]);
    expect(artist.rows).toHaveLength(1);
    expect(artist.rows[0].id).toBe(ccArtistId);
    expect(artist.rows[0].image_url).toBe(artistFixture.imageUrl);

    const loaded = await repo.loadCcArtistByShortId(shortId);
    expect(loaded).not.toBeNull();
    expect(loaded!.artist.jamendoId).toBe(jamendoArtistOnlyId);
    expect(loaded!.topTracks.map((t) => t.jamendoId)).toEqual(jamendoArtistTrackIds);

    const second = await repo.persistCcArtist({ ...artistFixture, name: "CC Integration Artist (re-resolved)" });
    expect(second.ccArtistId).toBe(ccArtistId);
    expect(second.shortId).toBe(shortId);
    const shortAfter = await pool.query(`SELECT id FROM cc_artist_short_urls WHERE cc_artist_id = $1`, [ccArtistId]);
    expect(shortAfter.rows).toHaveLength(1);
  });
});
