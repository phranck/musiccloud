import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSafeIntegrationDatabase } from "../__tests__/integration-database.js";
import { getDeezerPreviewExpiry } from "../lib/preview-url.js";
import { resolveMigrationsFolder } from "./run-migrations.js";

const MIGRATION_TAG = "0098_derive_signed_preview_expiry";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

/** Unix seconds of 2026-04-19, a moment that has passed. */
const EXPIRED_TOKEN_SECONDS = 1776591390;
/** A Deezer preview URL signed to expire at {@link EXPIRED_TOKEN_SECONDS}, the shape Deezer hands out. */
const EXPIRED_SIGNED_URL = `https://cdnt-preview.dzcdn.net/api/1/1/0/f/2/0/expired.mp3?hdnea=exp=${EXPIRED_TOKEN_SECONDS}~acl=/api/1/1/0/f/2/0/expired.mp3*~data=user_id=0,application_id=42~hmac=0f2a`;
const RECORDED_SIGNED_URL =
  "https://cdnt-preview.dzcdn.net/api/1/1/0/f/2/0/recorded.mp3?hdnea=exp=1790888975~acl=/api/1/1/0/f/2/0/recorded.mp3*~hmac=9b1c";
const PERMANENT_URL = "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/permanent.plus.aac.p.m4a";
const FOREIGN_HOST_TOKEN_URL = `https://preview.example.test/clip.mp3?hdnea=exp=${EXPIRED_TOKEN_SECONDS}~hmac=0f2a`;
const RECORDED_EXPIRY = new Date("2100-01-01T00:00:00Z");

interface PreviewRow {
  id: string;
  expires_at: Date | null;
}

/**
 * The migration reads the expiry with SQL, while every write path and the share
 * page read it with `getDeezerPreviewExpiry`. These cases hold the two to the
 * same answer: a signed `dzcdn.net` URL gets its token's expiry, and anything
 * else keeps what it had.
 *
 * The migration runs inside a rolled-back transaction against temporary tables
 * that shadow the real ones for this session, so no stored row is touched.
 */
describe.skipIf(!isSafeIntegrationDatabase(process.env.DATABASE_URL))(
  "signed preview expiry migration (integration)",
  () => {
    let client: pg.Client;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
    });

    afterAll(async () => {
      await client.end();
    });

    it("records the token expiry of a signed Deezer URL and leaves every other row as it was", async () => {
      const migration = await readFile(path.join(resolveMigrationsFolder(), `${MIGRATION_TAG}.sql`), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(
          "CREATE TEMP TABLE track_previews (LIKE public.track_previews INCLUDING ALL) ON COMMIT DROP",
        );
        await client.query(
          "CREATE TEMP TABLE album_previews (LIKE public.album_previews INCLUDING ALL) ON COMMIT DROP",
        );
        const shadowing = await client.query<{ track: boolean; album: boolean }>(
          `SELECT 'track_previews'::regclass = 'pg_temp.track_previews'::regclass AS track,
                  'album_previews'::regclass = 'pg_temp.album_previews'::regclass AS album`,
        );
        // Guards the claim above: the migration may only run once its unqualified
        // table names resolve to the temporary copies.
        expect(shadowing.rows[0]).toEqual({ track: true, album: true });

        await client.query(
          `INSERT INTO track_previews (id, track_id, service, url, expires_at, observed_at) VALUES
             ('signed-null', 'track', 'spotify', $1, NULL, now()),
             ('signed-recorded', 'track', 'deezer', $2, $3, now()),
             ('permanent', 'track', 'apple-music', $4, NULL, now()),
             ('foreign-host', 'track', 'tidal', $5, NULL, now())`,
          [EXPIRED_SIGNED_URL, RECORDED_SIGNED_URL, RECORDED_EXPIRY, PERMANENT_URL, FOREIGN_HOST_TOKEN_URL],
        );
        await client.query(
          `INSERT INTO album_previews (id, album_id, service, url, expires_at, observed_at) VALUES
             ('album-signed-null', 'album', 'spotify', $1, NULL, now())`,
          [EXPIRED_SIGNED_URL],
        );

        for (const statement of migration.split(STATEMENT_BREAKPOINT)) {
          await client.query(statement);
        }

        const tracks = await client.query<PreviewRow>("SELECT id, expires_at FROM track_previews ORDER BY id");
        const albums = await client.query<PreviewRow>("SELECT id, expires_at FROM album_previews ORDER BY id");
        const expiryOf = (rows: PreviewRow[], id: string) =>
          rows.find((row) => row.id === id)?.expires_at?.getTime() ?? null;

        expect(getDeezerPreviewExpiry(EXPIRED_SIGNED_URL)).toBe(EXPIRED_TOKEN_SECONDS * 1000);
        expect(expiryOf(tracks.rows, "signed-null")).toBe(getDeezerPreviewExpiry(EXPIRED_SIGNED_URL));
        expect(expiryOf(albums.rows, "album-signed-null")).toBe(getDeezerPreviewExpiry(EXPIRED_SIGNED_URL));
        expect(expiryOf(tracks.rows, "signed-recorded")).toBe(RECORDED_EXPIRY.getTime());
        expect(getDeezerPreviewExpiry(PERMANENT_URL)).toBeNull();
        expect(expiryOf(tracks.rows, "permanent")).toBeNull();
        expect(getDeezerPreviewExpiry(FOREIGN_HOST_TOKEN_URL)).toBeNull();
        expect(expiryOf(tracks.rows, "foreign-host")).toBeNull();
      } finally {
        await client.query("ROLLBACK");
      }
    });
  },
);
