import { PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";

interface OGMetaInput {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  shortId: string;
  availablePlatforms: ServiceId[];
  origin?: string;
}

export interface OGMeta {
  pageTitle: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  ogUrl: string;
  twitterCard: string;
}

interface AlbumOGMetaInput {
  title: string;
  artist: string;
  totalTracks?: number;
  releaseDate?: string;
  albumArtUrl: string;
  shortId: string;
  availablePlatforms: ServiceId[];
  origin?: string;
}

const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 65;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

export function generateAlbumOGMeta(input: AlbumOGMetaInput): OGMeta {
  const {
    title,
    artist,
    totalTracks,
    releaseDate,
    albumArtUrl,
    shortId,
    availablePlatforms,
    origin = "https://musiccloud.io",
  } = input;

  const year = releaseDate?.slice(0, 4);
  const fullTitle = `${title} – ${artist}`;
  const ogTitle = truncate(fullTitle, MAX_TITLE_LENGTH);

  const serviceNames = availablePlatforms.map((p) => PLATFORM_CONFIG[p].label);
  let ogDescription: string;
  if (serviceNames.length === 0) {
    ogDescription = "Find this album on musiccloud";
  } else if (serviceNames.length === 1) {
    ogDescription = `Listen on ${serviceNames[0]}`;
  } else {
    const first = serviceNames.slice(0, 2).join(", ");
    ogDescription =
      serviceNames.length > 2 ? `Listen on ${first} +${serviceNames.length - 2} more` : `Listen on ${first}`;
  }

  if (totalTracks || year) {
    const meta = [totalTracks ? `${totalTracks} tracks` : null, year].filter(Boolean).join(", ");
    const withMeta = `${ogDescription} | ${meta}`;
    if (withMeta.length <= MAX_DESCRIPTION_LENGTH) ogDescription = withMeta;
  }

  ogDescription = truncate(ogDescription, MAX_DESCRIPTION_LENGTH);

  return {
    pageTitle: `${ogTitle} | musiccloud`,
    ogTitle,
    ogDescription,
    ogImageUrl: albumArtUrl || "/og/default.jpg",
    ogUrl: `${origin}/${shortId}`,
    twitterCard: "summary_large_image",
  };
}

export function generateOGMeta(input: OGMetaInput): OGMeta {
  const { title, artist, album, albumArtUrl, shortId, availablePlatforms, origin = "https://musiccloud.io" } = input;

  // og:title - "{title} - {artist}" truncated to 60 chars
  const fullTitle = `${title} - ${artist}`;
  const ogTitle = truncate(fullTitle, MAX_TITLE_LENGTH);

  // og:description - "Listen on {services}" truncated to 65 chars
  const serviceNames = availablePlatforms.map((p) => PLATFORM_CONFIG[p].label);
  let ogDescription: string;
  if (serviceNames.length === 0) {
    ogDescription = "Find this song on musiccloud";
  } else if (serviceNames.length === 1) {
    ogDescription = `Listen on ${serviceNames[0]}`;
  } else if (serviceNames.length === 2) {
    ogDescription = `Listen on ${serviceNames[0]} and ${serviceNames[1]}`;
  } else {
    const last = serviceNames.pop();
    ogDescription = `Listen on ${serviceNames.join(", ")}, and ${last}`;
  }

  // Append album if it fits
  if (album) {
    const withAlbum = `${ogDescription} | ${album}`;
    if (withAlbum.length <= MAX_DESCRIPTION_LENGTH) {
      ogDescription = withAlbum;
    }
  }

  ogDescription = truncate(ogDescription, MAX_DESCRIPTION_LENGTH);

  // For MVP: use album art directly. Phase 2 will generate custom OG images.
  const ogImageUrl = albumArtUrl || `/og/default.jpg`;

  return {
    pageTitle: `${ogTitle} | musiccloud`,
    ogTitle,
    ogDescription,
    ogImageUrl,
    ogUrl: `${origin}/${shortId}`,
    twitterCard: "summary_large_image",
  };
}
