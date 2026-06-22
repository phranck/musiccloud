/**
 * @file CC (Jamendo) share-page loader for `GET /api/v1/share/:shortId`.
 *
 * The commercial loaders in `share-page.ts` read the cross-service tables; this
 * is their CC sibling. A CC short id is resolved to its `{ kind, jamendoId }`
 * via `findCcShortId`, then the full entity (and the live right-column artist
 * info) is refetched from Jamendo and projected through the shared
 * `cc-share-response` builders — the exact same data the live resolve produces,
 * so the persistent share page and the live view render identically.
 *
 * The album track list and the right-column `artistInfo` are deliberately NOT
 * read from the DB (CC persistence stores neither); they are fetched live, which
 * keeps the share page a faithful mirror at the cost of a few throttled Jamendo
 * calls per open. The share route caches the response for an hour.
 */
import type {
  CcAlbumSharePageResponse,
  CcArtistSharePageResponse,
  CcTrackSharePageResponse,
  OgMeta,
} from "@musiccloud/shared";
import { getCcRepository } from "../../db/index.js";
import { buildCcAlbumPayload, buildCcArtistPayload, buildCcTrackPayload } from "../../services/cc/cc-share-response.js";
import {
  getCcAlbum,
  getCcAlbumTracks,
  getCcArtist,
  getCcArtistTopTracks,
  getCcTrack,
} from "../../services/cc/jamendo/client.js";
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
 * Loads the CC share-page payload for a public short id.
 *
 * Resolves the short id to its kind + Jamendo id, refetches the entity and its
 * right-column artist info live from Jamendo, and shapes the matching CC variant
 * of {@link CcSharePageResponse}. Returns `null` when the id is not a CC short id
 * or the Jamendo entity is gone (the route then falls through to its 404).
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
      const track = await getCcTrack(lookup.jamendoId);
      if (!track) return null;
      const { track: apiTrack, artistInfo } = await buildCcTrackPayload(track);
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
      return { type: "cc-track", og, shortUrl, track: apiTrack, artistInfo };
    }
    case "cc-album": {
      const album = await getCcAlbum(lookup.jamendoId);
      if (!album) return null;
      const tracks = await getCcAlbumTracks(album.jamendoId);
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
      const artist = await getCcArtist(lookup.jamendoId);
      if (!artist) return null;
      const topTracks = await getCcArtistTopTracks(artist.jamendoId);
      const { artist: apiArtist, artistInfo } = await buildCcArtistPayload(artist, topTracks);
      // No artist OG generator exists (the commercial artist builds it inline too).
      const og: OgMeta = {
        title: `${artist.name} - musiccloud`,
        description: `Listen to ${artist.name} on musiccloud`,
        image: artist.imageUrl ?? "/og/default.jpg",
        url: shortUrl,
      };
      return { type: "cc-artist", og, shortUrl, artist: apiArtist, artistInfo };
    }
  }
}
