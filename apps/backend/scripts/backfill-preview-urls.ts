#!/usr/bin/env tsx
/**
 * Backfill script: populate missing preview_url values for tracks.
 *
 * For each track where preview_url IS NULL and a Deezer or Spotify link exists,
 * this script fetches the preview URL from the respective API and writes it to the DB.
 *
 * Strategy: Deezer first (public API, no auth), then Spotify (requires credentials).
 *
 * Usage:
 *   DATABASE_PATH=data/music.db npx tsx apps/backend/scripts/backfill-preview-urls.ts
 *   DATABASE_PATH=data/music.db npx tsx apps/backend/scripts/backfill-preview-urls.ts --dry-run
 *   DATABASE_PATH=data/music.db npx tsx apps/backend/scripts/backfill-preview-urls.ts --limit 50
 */

import Database from "better-sqlite3";
import path from "path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DB_PATH = process.env.DATABASE_PATH ?? "data/music.db";
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1] ?? "0", 10) : 0;
const DELAY_MS = 250; // polite delay between API calls

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Deezer – public API, no authentication required
// ---------------------------------------------------------------------------

async function getDeezerPreview(externalId: string): Promise<string | null> {
  try {
    const res = await timedFetch(`https://api.deezer.com/track/${externalId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { preview?: string; error?: unknown };
    if ("error" in data) return null;
    return data.preview ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Spotify – OAuth client_credentials
// ---------------------------------------------------------------------------

interface SpotifyToken {
  value: string;
  expiresAt: number;
}

let cachedSpotifyToken: SpotifyToken | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (cachedSpotifyToken && Date.now() < cachedSpotifyToken.expiresAt - 60_000) {
    return cachedSpotifyToken.value;
  }

  try {
    const res = await timedFetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedSpotifyToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedSpotifyToken.value;
  } catch {
    return null;
  }
}

async function getSpotifyPreview(externalId: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const res = await timedFetch(`https://api.spotify.com/v1/tracks/${externalId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preview_url?: string | null };
    return data.preview_url ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface TrackRow {
  id: string;
  title: string;
  artists: string; // JSON array
}

interface ServiceLinkRow {
  service: string;
  external_id: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const absPath = path.resolve(DB_PATH);
  console.log(`Database : ${absPath}`);
  console.log(`Mode     : ${DRY_RUN ? "DRY RUN (no changes written)" : "LIVE"}`);
  if (LIMIT > 0) console.log(`Limit    : ${LIMIT} tracks`);
  console.log();

  const db = new Database(absPath, { readonly: DRY_RUN });

  // All tracks with missing preview_url that have at least one Deezer or Spotify link.
  // Ordered newest first so the most recently resolved tracks get fixed first.
  const allRows = db
    .prepare(
      `SELECT DISTINCT t.id, t.title, t.artists
       FROM tracks t
       JOIN service_links sl ON sl.track_id = t.id
       WHERE t.preview_url IS NULL
         AND sl.service IN ('deezer', 'spotify')
       ORDER BY t.created_at DESC`,
    )
    .all() as TrackRow[];

  const rows = LIMIT > 0 ? allRows.slice(0, LIMIT) : allRows;
  console.log(`Tracks to process: ${rows.length} (total with missing preview: ${allRows.length})`);

  if (rows.length === 0) {
    console.log("Nothing to do.");
    db.close();
    return;
  }

  const updateStmt = DRY_RUN
    ? null
    : db.prepare("UPDATE tracks SET preview_url = ?, updated_at = ? WHERE id = ?");

  let updated = 0;
  let noneFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    let artists: string;
    try {
      artists = (JSON.parse(row.artists) as string[]).join(", ");
    } catch {
      artists = row.artists;
    }

    process.stdout.write(`[${i + 1}/${rows.length}] "${row.title}" — ${artists} … `);

    // Prefer Deezer (sorted first), fall back to Spotify.
    const links = db
      .prepare(
        `SELECT service, external_id
         FROM service_links
         WHERE track_id = ?
           AND service IN ('deezer', 'spotify')
         ORDER BY CASE service WHEN 'deezer' THEN 1 WHEN 'spotify' THEN 2 END`,
      )
      .all(row.id) as ServiceLinkRow[];

    let previewUrl: string | null = null;
    let source = "";

    for (const link of links) {
      if (!link.external_id) continue;

      await sleep(DELAY_MS);

      if (link.service === "deezer") {
        previewUrl = await getDeezerPreview(link.external_id);
        if (previewUrl) { source = "Deezer"; break; }
      } else if (link.service === "spotify") {
        previewUrl = await getSpotifyPreview(link.external_id);
        if (previewUrl) { source = "Spotify"; break; }
      }
    }

    if (previewUrl) {
      console.log(`✓ ${source}`);
      if (!DRY_RUN) {
        updateStmt!.run(previewUrl, Date.now(), row.id);
      } else {
        console.log(`   [dry-run] preview_url = ${previewUrl.slice(0, 72)}…`);
      }
      updated++;
    } else {
      console.log("✗ no preview available");
      noneFound++;
    }
  }

  db.close();

  console.log();
  console.log(`Done.`);
  console.log(`  Updated        : ${updated}`);
  console.log(`  No preview     : ${noneFound}`);
  if (allRows.length > rows.length) {
    console.log(`  Remaining      : ${allRows.length - rows.length} (run again without --limit to process all)`);
  }
}

main().catch((err: unknown) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
