import { SITE_ORIGIN } from "@musiccloud/shared";

/**
 * The origin the dashboard's share links point at.
 *
 * `VITE_SHARE_BASE_URL` overrides it for a deployment whose public site lives
 * elsewhere, and the production site is the fallback. The track, album and
 * artist lists all link through this, so a share link from any of them opens
 * on the same host.
 */
export const SHARE_BASE: string = import.meta.env.VITE_SHARE_BASE_URL ?? SITE_ORIGIN.site;
