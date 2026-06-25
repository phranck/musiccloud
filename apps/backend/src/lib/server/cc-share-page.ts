/**
 * @file CC (Jamendo) share-page loader for `GET /api/v1/share/:shortId`.
 *
 * The commercial loaders in `share-page.ts` read the cross-service tables; this
 * is their CC sibling. A CC short id is resolved to its kind via `findCcShortId`,
 * then the entity is read straight from the DB
 * (`loadCc{Track,Album,Artist}ByShortId`) and projected through the shared
 * `cc-share-response` builders — no live Jamendo call on the critical open path,
 * so the page never 404s on a Jamendo hiccup and loads at DB latency (mirroring
 * the commercial path).
 *
 * The CC entity is persisted in full at resolve time (track details, album
 * tracklist, artist top tracks). The right-column `artistInfo` (similar tracks +
 * artist profile) is the only Jamendo touch: cc-track loads it client-side via
 * `/api/cc/artist-info`; cc-album/cc-artist build it from the DB tracks via
 * `buildCc{Album,Artist}Payload`, whose enrichment calls are fault-tolerant (see
 * `buildCcArtistInfo`) so they never fail the share. The share route caches the
 * response for an hour.
 */
import type {
  CcAlbumSharePageResponse,
  CcArtistSharePageResponse,
  CcTrackSharePageResponse,
  OgMeta,
} from "@musiccloud/shared";
import { getCcRepository } from "../../db/index.js";
import {
  buildCcAlbumPayload,
  buildCcArtistPayload,
  mapDbRowToCcAlbum,
  mapDbRowToCcArtist,
  mapDbRowToCcTrack,
  toApiCcTrack,
} from "../../services/cc/cc-share-response.js";
import { generateAlbumOGMeta, generateOGMeta, type OGMeta } from "./og.js";

const DEFAULT_ORIGIN = "https://musiccloud.io";

/** Any CC variant of the share-page response. */
type CcSharePageResponse = CcTrackSharePageResponse | CcAlbumSharePageResponse | CcArtistSharePageResponse;

/**
 * Maps the internal {@link OGMeta} to the wire {@link OgMeta} the share endpoint
 * emits (the same projection the commercial route applies).
 *
 * @param meta - The internal OG meta from the generators.
 * @returns The wire-format OG meta.
 */
function toWireOg(meta: OGMeta): OgMeta {
  return { title: meta.ogTitle, description: meta.ogDescription, image: meta.ogImageUrl, url: meta.ogUrl };
}

/**
 * Loads the CC share-page payload for a public short id from the DB (no Jamendo
 * on the critical path).
 *
 * Resolves the short id to its kind, reads the matching entity (track / album +
 * tracklist / artist + top tracks) from the DB, and shapes the matching CC
 * variant of {@link CcSharePageResponse}. Returns `null` only when the id is not
 * a CC short id (the route then falls through to its 404).
 *
 * @param shortId - The public CC short code from the share URL.
 * @param origin - User-facing origin for the OG/short URLs (defaults to the prod host).
 * @returns The CC share-page response, or `null` when nothing matches.
 */
export async function loadCcByShortId(shortId: string, origin?: string): Promise<CcSharePageResponse | null> {
  const repo = await getCcRepository();
  const lookup = await repo.findCcShortId(shortId);
  if (!lookup) return null;

  const shortUrl = `${origin ?? DEFAULT_ORIGIN}/${shortId}`;

  switch (lookup.kind) {
    case "cc-track": {
      const row = await repo.loadCcTrackByShortId(shortId);
      if (!row) return null;
      const track = mapDbRowToCcTrack(row);
      // Core card only — the artist column loads client-side via /api/cc/artist-info.
      const og = toWireOg(
        generateOGMeta({
          title: track.title,
          artist: track.artistName,
          album: track.albumName,
          albumArtUrl: track.artworkUrl ?? "",
          shortId,
          availablePlatforms: [],
          origin,
        }),
      );
      return { type: "cc-track", og, shortUrl, track: toApiCcTrack(track) };
    }
    case "cc-album": {
      const data = await repo.loadCcAlbumByShortId(shortId);
      if (!data) return null;
      const album = mapDbRowToCcAlbum(data.album);
      const tracks = data.tracks.map(mapDbRowToCcTrack);
      const { album: apiAlbum, artistInfo } = await buildCcAlbumPayload(album, tracks);
      const og = toWireOg(
        generateAlbumOGMeta({
          title: album.name,
          artist: album.artistName,
          totalTracks: tracks.length,
          releaseDate: album.releaseDate,
          albumArtUrl: album.artworkUrl ?? "",
          shortId,
          availablePlatforms: [],
          origin,
        }),
      );
      return { type: "cc-album", og, shortUrl, album: apiAlbum, artistInfo };
    }
    case "cc-artist": {
      const data = await repo.loadCcArtistByShortId(shortId);
      if (!data) return null;
      const artist = mapDbRowToCcArtist(data.artist);
      const topTracks = data.topTracks.map(mapDbRowToCcTrack);
      const { artist: apiArtist, artistInfo } = await buildCcArtistPayload(artist, topTracks);
      // No artist OG generator exists (the commercial artist builds it inline too).
      // og:image must be absolute (crawler previews + the share-page schema's
      // `format: uri` validation).
      const og: OgMeta = {
        title: `${artist.name} - musiccloud`,
        description: `Listen to ${artist.name} on musiccloud`,
        image: artist.imageUrl ?? `${origin ?? DEFAULT_ORIGIN}/og/default.jpg`,
        url: shortUrl,
      };
      return { type: "cc-artist", og, shortUrl, artist: apiArtist, artistInfo };
    }
  }
}
