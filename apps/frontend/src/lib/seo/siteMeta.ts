/**
 * @file What the site says about itself to search engines and to the previews
 * a shared link unfolds into, in one place for every page that says it.
 */

import { SITE_ORIGIN } from "@musiccloud/shared";

/** The site's name, as `og:site_name` and the suffix of every page title carry it: `musiccloud`. */
export const SITE_NAME = "musiccloud";

/**
 * What the site is for, in one sentence. The home page's description, and the
 * description of any page that holds no paragraph long enough to describe it.
 */
export const SITE_DESCRIPTION =
  "Paste a Spotify, Apple Music, or YouTube link and get a universal share link that works everywhere.";

/** The language the site writes in, as `og:locale` names it: `en_US`. */
export const SITE_LOCALE = "en_US";

/** The picture a shared link to the site unfolds into, served from the frontend's `public/og/`. */
export const SITE_SHARE_IMAGE = {
  /** The picture's absolute address, because a preview is fetched from elsewhere. */
  url: `${SITE_ORIGIN.site}/og/musiccloud.jpg`,
  /** Its width in pixels: 1200, the size the large preview card is drawn at. */
  width: 1200,
  /** Its height in pixels: 630, which with the width gives the card's 1.91 to 1. */
  height: 630,
  /** What it shows, for anybody who cannot see it. */
  alt: "musiccloud - Share music across every platform",
} as const;
