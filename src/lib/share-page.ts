import { db } from "../db/index.js";
import { tracks, serviceLinks, shortUrls } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateOGMeta, type OGMeta } from "./og-helpers.js";
import { PLATFORM_CONFIG, type Platform } from "./utils.js";

export interface SharePageData {
  track: {
    title: string;
    albumName: string | null;
    artworkUrl: string | null;
  };
  artists: string[];
  artistDisplay: string;
  shortId: string;
  links: { service: string; url: string }[];
  availablePlatforms: Platform[];
  og: OGMeta;
}

function safeParseArtists(json: string): string[] {
  try { return JSON.parse(json); }
  catch { return ["Unknown Artist"]; }
}

/** Load share page data by short URL ID. Returns null if not found. */
export function loadByShortId(shortId: string, origin?: string): SharePageData | null {
  const rows = db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      artists: tracks.artists,
      albumName: tracks.albumName,
      artworkUrl: tracks.artworkUrl,
      linkService: serviceLinks.service,
      linkUrl: serviceLinks.url,
    })
    .from(shortUrls)
    .innerJoin(tracks, eq(tracks.id, shortUrls.trackId))
    .innerJoin(serviceLinks, eq(serviceLinks.trackId, shortUrls.trackId))
    .where(eq(shortUrls.id, shortId))
    .all();

  if (rows.length === 0) return null;

  return buildPageData(rows, shortId, origin);
}

/** Load share page data by track ID. Returns null if not found. */
export function loadByTrackId(trackId: string, origin?: string): SharePageData | null {
  const rows = db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      artists: tracks.artists,
      albumName: tracks.albumName,
      artworkUrl: tracks.artworkUrl,
      linkService: serviceLinks.service,
      linkUrl: serviceLinks.url,
      shortUrlId: shortUrls.id,
    })
    .from(tracks)
    .innerJoin(serviceLinks, eq(serviceLinks.trackId, tracks.id))
    .leftJoin(shortUrls, eq(shortUrls.trackId, tracks.id))
    .where(eq(tracks.id, trackId))
    .all();

  if (rows.length === 0) return null;

  const shortId = rows[0].shortUrlId ?? trackId;
  return buildPageData(rows, shortId, origin);
}

function buildPageData(
  rows: { title: string; artists: string; albumName: string | null; artworkUrl: string | null; linkService: string; linkUrl: string }[],
  shortId: string,
  origin?: string,
): SharePageData {
  const first = rows[0];
  const artists = safeParseArtists(first.artists);
  const artistDisplay = artists.join(", ");

  const links = rows.map((r) => ({ service: r.linkService, url: r.linkUrl }));
  const availablePlatforms: Platform[] = links
    .map((l) => l.service as Platform)
    .filter((s) => s in PLATFORM_CONFIG);

  const og = generateOGMeta({
    title: first.title,
    artist: artistDisplay,
    album: first.albumName ?? undefined,
    albumArtUrl: first.artworkUrl ?? "/og/default.jpg",
    shortId,
    availablePlatforms,
    origin,
  });

  return {
    track: { title: first.title, albumName: first.albumName, artworkUrl: first.artworkUrl },
    artists,
    artistDisplay,
    shortId,
    links,
    availablePlatforms,
    og,
  };
}
