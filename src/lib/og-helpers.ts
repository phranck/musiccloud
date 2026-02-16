import type { Platform } from "./utils";
import { PLATFORM_CONFIG } from "./utils";

interface OGMetaInput {
  title: string;
  artist: string;
  album?: string;
  albumArtUrl: string;
  shortId: string;
  availablePlatforms: Platform[];
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

const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 65;

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function generateOGMeta(input: OGMetaInput): OGMeta {
  const { title, artist, album, albumArtUrl, shortId, availablePlatforms, origin = "https://music.cloud" } =
    input;

  // og:title - "{title} - {artist}" truncated to 60 chars
  const fullTitle = `${title} - ${artist}`;
  const ogTitle = truncate(fullTitle, MAX_TITLE_LENGTH);

  // og:description - "Listen on {services}" truncated to 65 chars
  const serviceNames = availablePlatforms.map(
    (p) => PLATFORM_CONFIG[p].label,
  );
  let ogDescription: string;
  if (serviceNames.length === 0) {
    ogDescription = "Find this song on music.cloud";
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
    pageTitle: `${ogTitle} | music.cloud`,
    ogTitle,
    ogDescription,
    ogImageUrl,
    ogUrl: `${origin}/${shortId}`,
    twitterCard: "summary_large_image",
  };
}
