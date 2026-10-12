/**
 * @file Replaces the Apple Music covers stored before #622.
 *
 * Apple allows its artwork only together with MusicKit playback, so the
 * resolvers keep none since #622 (`services/artwork.ts`). Rows resolved before
 * that still carry one: tracks and albums in `artwork_url`, resolved artists in
 * `artist_profiles.image_url`. This asks Spotify and then Deezer for the same
 * recording by ISRC, the same release by UPC, and the same artist by its stored
 * link, and writes the first cover that is not Apple's. Where every service
 * answered and none has a cover, it clears the cover, and the interface shows
 * its placeholder. Where a service failed and no cover was found, it leaves the
 * row for the next run, because a failure says nothing about the cover.
 *
 * Without `--apply` it only counts the rows. Run it against the local
 * database, then against the deployed one, with the Spotify credentials
 * (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`) in the environment:
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> pnpm tsx src/scripts/replace-apple-artwork.ts
 *   DATABASE_URL=<target> pnpm tsx src/scripts/replace-apple-artwork.ts --apply
 *
 * Every row is written as soon as its lookups are done, so an interrupted run
 * keeps what it finished. A second run finds only the rows a failure left.
 */

import * as pgModule from "pg";
import { isAppleArtworkUrl, pickArtworkUrl } from "../services/artwork.js";
import { deezerAdapter } from "../services/plugins/deezer/adapter.js";
import { spotifyAdapter } from "../services/plugins/spotify/adapter.js";

/** The prefix of every line this script prints, and the file name it runs under. */
const SCRIPT_NAME = "replace-apple-artwork";

/**
 * The pause after each row. Each row costs at most two requests, one to
 * Spotify and one to Deezer, so this keeps both below eight a second. Deezer
 * refuses more than fifty in five seconds, and a refusal would leave the row
 * for another run.
 */
const PAUSE_BETWEEN_ROWS_MS = 120;

/** One way to ask a service for a cover. It answers `undefined` when the service has none. */
type ArtworkLookup = () => Promise<string | undefined>;

/**
 * What happens to one stored Apple cover.
 *
 * - `replace`: another service's cover takes its place.
 * - `clear`: every service answered and none has a cover, so none is kept.
 * - `keep`: a service failed and no cover was found, so the row waits for the
 *   next run. `reason` is the first failure's message.
 */
type Replacement = { kind: "replace"; url: string } | { kind: "clear" } | { kind: "keep"; reason: string };

/**
 * Asks the lookups in turn for a cover that is not Apple's.
 *
 * @param lookups - The services to ask, in order of preference.
 * @returns The first cover found, else `clear` when every lookup answered,
 *   else `keep` with the first failure.
 */
async function findReplacement(lookups: readonly ArtworkLookup[]): Promise<Replacement> {
  let failure: unknown;
  for (const lookup of lookups) {
    try {
      const url = pickArtworkUrl(await lookup(), []);
      if (url) return { kind: "replace", url };
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure === undefined) return { kind: "clear" };
  return { kind: "keep", reason: failure instanceof Error ? failure.message : String(failure) };
}

/** A stored row whose cover is Apple's. */
interface AppleArtworkRow {
  /** The row's key. */
  key: string;
  /** The Apple cover as stored, which the update requires to still be there. */
  url: string;
  /** What the lookups need: an ISRC, a UPC, or an artist's Spotify and Deezer ids. */
  [identifier: string]: string | null;
}

/** One table that stores covers, and how to find a replacement for one of its rows. */
interface ArtworkTarget {
  /** How the report names it. */
  label: string;
  table: "tracks" | "albums" | "artist_profiles";
  keyColumn: "id" | "artist_entity_id";
  column: "artwork_url" | "image_url";
  /** Selects `key`, `url` and the identifiers of the rows whose cover may be Apple's. */
  select: string;
  /** The lookups for one row, Spotify's first. */
  lookups(row: AppleArtworkRow): ArtworkLookup[];
}

/** Matches every row that might hold an Apple cover; `isAppleArtworkUrl` decides. */
const MAYBE_APPLE = "'%mzstatic.com%'";

const TARGETS: readonly ArtworkTarget[] = [
  {
    label: "tracks",
    table: "tracks",
    keyColumn: "id",
    column: "artwork_url",
    select: `select id as key, artwork_url as url, isrc from tracks where artwork_url like ${MAYBE_APPLE} order by id`,
    lookups: ({ isrc }) =>
      isrc
        ? [
            async () => (await spotifyAdapter.findByIsrc(isrc))?.artworkUrl,
            async () => (await deezerAdapter.findByIsrc(isrc))?.artworkUrl,
          ]
        : [],
  },
  {
    label: "albums",
    table: "albums",
    keyColumn: "id",
    column: "artwork_url",
    select: `select id as key, artwork_url as url, upc from albums where artwork_url like ${MAYBE_APPLE} order by id`,
    lookups: ({ upc }) =>
      upc
        ? [
            async () => (await spotifyAdapter.findAlbumByUpc(upc))?.artworkUrl,
            async () => (await deezerAdapter.findAlbumByUpc(upc))?.artworkUrl,
          ]
        : [],
  },
  {
    label: "artists",
    table: "artist_profiles",
    keyColumn: "artist_entity_id",
    column: "image_url",
    select: `select p.artist_entity_id as key, p.image_url as url,
        (select external_id from artist_service_links l where l.artist_entity_id = p.artist_entity_id
          and l.service = 'spotify' and l.external_id is not null order by l.created_at limit 1) as spotify_id,
        (select external_id from artist_service_links l where l.artist_entity_id = p.artist_entity_id
          and l.service = 'deezer' and l.external_id is not null order by l.created_at limit 1) as deezer_id
      from artist_profiles p where p.image_url like ${MAYBE_APPLE} order by p.artist_entity_id`,
    lookups: ({ spotify_id: spotifyId, deezer_id: deezerId }) => [
      ...(spotifyId ? [async () => (await spotifyAdapter.getArtist(spotifyId)).imageUrl] : []),
      ...(deezerId ? [async () => (await deezerAdapter.getArtist(deezerId)).imageUrl] : []),
    ],
  },
];

/** How many rows of one table ended which way. */
interface Tally {
  replaced: number;
  cleared: number;
  kept: number;
}

/**
 * Replaces or clears the Apple covers of one table, one row at a time.
 *
 * @param client - A connected client.
 * @param target - The table.
 * @param rows - Its rows with an Apple cover.
 * @returns How many rows ended which way.
 */
async function replaceCovers(
  client: pgModule.Client,
  target: ArtworkTarget,
  rows: readonly AppleArtworkRow[],
): Promise<Tally> {
  const tally: Tally = { replaced: 0, cleared: 0, kept: 0 };
  for (const row of rows) {
    const replacement = await findReplacement(target.lookups(row));
    if (replacement.kind === "keep") {
      tally.kept++;
      console.error(`[${SCRIPT_NAME}] ${target.label} ${row.key}: left for the next run, ${replacement.reason}`);
    } else {
      // The stored cover is part of the condition, so a row that changed
      // since it was read is not overwritten.
      await client.query(
        `update ${target.table} set ${target.column} = $1 where ${target.keyColumn} = $2 and ${target.column} = $3`,
        [replacement.kind === "replace" ? replacement.url : null, row.key, row.url],
      );
      tally[replacement.kind === "replace" ? "replaced" : "cleared"]++;
    }
    await new Promise((settle) => setTimeout(settle, PAUSE_BETWEEN_ROWS_MS));
  }
  return tally;
}

/**
 * Counts the stored Apple covers, and replaces them when asked.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(`[${SCRIPT_NAME}] DATABASE_URL is not set.`);
    process.exit(1);
  }

  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({ connectionString });
  await client.connect();

  let kept = 0;
  try {
    for (const target of TARGETS) {
      const { rows } = await client.query<AppleArtworkRow>(target.select);
      const appleRows = rows.filter((row) => isAppleArtworkUrl(row.url));
      if (!apply) {
        console.log(`[${SCRIPT_NAME}] ${target.label}: ${appleRows.length} with an Apple cover`);
        continue;
      }
      const tally = await replaceCovers(client, target, appleRows);
      kept += tally.kept;
      console.log(
        `[${SCRIPT_NAME}] ${target.label}: ${tally.replaced} replaced, ${tally.cleared} cleared, ${tally.kept} left for the next run`,
      );
    }
    if (!apply) console.log(`[${SCRIPT_NAME}] pass --apply to replace them.`);
  } finally {
    await client.end();
  }
  if (kept > 0) process.exit(1);
}

if (process.argv[1]?.endsWith(`${SCRIPT_NAME}.ts`)) {
  main().catch((error) => {
    console.error(`[${SCRIPT_NAME}]`, error);
    process.exit(1);
  });
}

export { findReplacement };
