/**
 * Browser- and SSR-safe gate for website tracking (Umami). Reads
 * `PUBLIC_TRACKING_ENABLED` via `import.meta.env`, which Astro exposes both
 * server-side and in the client bundle. Lives outside `api/client.ts` so the
 * browser bundle that imports `sendMusicSignal` does NOT pull in the
 * server-only `BACKEND_URL` / `INTERNAL_API_KEY` top-level reads that touch
 * `process.env`.
 *
 * Default is `true`: a missing value sends events, only an explicit
 * `"false"` suppresses them.
 */
export function isTrackingEnabled(): boolean {
  const val = (import.meta.env.PUBLIC_TRACKING_ENABLED as string | undefined) ?? "true";
  return val === "true";
}
