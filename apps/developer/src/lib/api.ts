/**
 * @file Backend address + header helpers for the developer-portal BFF.
 *
 * Mirrors the resolution strategy of the main frontend's
 * `apps/frontend/src/api/client.ts`: `BACKEND_URL` comes from the runtime
 * environment (`.env.local` is local-dev only), and `INTERNAL_API_KEY` is the
 * shared secret the backend's `authenticateInternal` guard checks.
 *
 * ## Auth note for `/api/dev/*`
 *
 * The backend splits this namespace. `devAuthRoutes` and `devGitHubRoutes` are
 * registered at the root scope with no auth preHandler, whilst the API-access
 * routes sit inside `devProtectedRoutes` behind `authenticateDeveloper`. In
 * both cases the credential that decides the request is the httpOnly
 * `mc_dev_session` cookie, not the internal key.
 *
 * The BFF attaches `X-API-Key` anyway, so the proxy stays uniform with the main
 * frontend and keeps working if `/api/dev/*` is ever put behind
 * `authenticateInternal`. Because that key is full authentication on the routes
 * behind `authenticatePublic`, the proxy confines its target to `/api/dev/`
 * before attaching it.
 */

/**
 * Backend base URL, resolved only when a backend call is requested.
 *
 * Reads `import.meta.env.BACKEND_URL` first (baked at build time / present in
 * dev), then falls back to `process.env.BACKEND_URL` (runtime container env).
 * Deferring the check keeps statically prerendered public routes independent of
 * runtime-only container environment variables.
 */
function backendBaseUrl(): string {
  const value = (import.meta.env.BACKEND_URL as string | undefined)?.trim() || process.env.BACKEND_URL?.trim();
  if (!value) {
    throw new Error(
      "Missing BACKEND_URL. Set it in the runtime environment. .env.local is only for local development.",
    );
  }
  return value;
}

/**
 * Shared secret for the backend's internal API surface. Empty when unset, in
 * which case {@link internalHeaders} omits the `X-API-Key` header entirely.
 */
export const INTERNAL_API_KEY: string =
  (import.meta.env.INTERNAL_API_KEY as string | undefined) ?? process.env.INTERNAL_API_KEY ?? "";

/**
 * Join a backend-relative path onto the resolved {@link BACKEND_URL}.
 *
 * @param path - An absolute backend path beginning with `/` (e.g.
 *   `/api/dev/auth/me`). Callers pass the full path; this helper only prefixes
 *   the host so the backend origin lives in exactly one place.
 * @returns The fully qualified backend URL.
 */
export function backendUrl(path: string): string {
  return `${backendBaseUrl()}${path}`;
}

/**
 * Build the header set for a server-to-backend call from the BFF.
 *
 * Always sets `Content-Type: application/json` and (when configured) the
 * `X-API-Key`. The real visitor IP is forwarded as `X-Forwarded-For` so the
 * backend's per-IP rate limiters bucket by user rather than by the developer
 * pod's IP.
 *
 * @param clientIp - The visitor's address (`Astro.clientAddress`). Forwarded as
 *   `X-Forwarded-For` when present; omitted otherwise.
 * @param extra - Optional additional headers merged last (they win on conflict).
 * @returns A plain header record suitable for `fetch`'s `headers` option.
 */
export function internalHeaders(clientIp?: string, extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_API_KEY ? { "X-API-Key": INTERNAL_API_KEY } : {}),
    ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
    ...extra,
  };
}
