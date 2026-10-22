/**
 * @file The production address of every musiccloud host.
 *
 * Every app reads a production address from here: as the fallback where an
 * environment variable can override it, as the canonical address a page
 * names, and as the host a description or a code sample points at. Moving a
 * host to another address is then one edit. The variables that override an
 * address at runtime (`PUBLIC_URL` in the backend, `VITE_SHARE_BASE_URL` in
 * the dashboard, `PUBLIC_API_URL` in the portal) stay where they are and fall
 * back to this table.
 *
 * The example values inside the published contract, in `openapi-schemas.ts`
 * and `email-variables.ts`, are examples a reader copies, and they stay
 * written out.
 */
export const SITE_ORIGIN = {
  /** The public site, where short links resolve and share pages live. */
  site: "https://musiccloud.io",
  /** The developer portal with the API reference. */
  developer: "https://developer.musiccloud.io",
  /** The public API. */
  api: "https://api.musiccloud.io",
  /** The admin dashboard. */
  dashboard: "https://dashboard.musiccloud.io",
} as const;
