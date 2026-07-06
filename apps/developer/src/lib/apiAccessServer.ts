/**
 * @file Server-side (SSR) reads for the developer's API-access data.
 *
 * The Usage page renders its content in `.astro` frontmatter, so it fetches
 * server-to-server like `session.ts` does: forward the `mc_dev_session`
 * cookie and the real client IP to the backend's `clientsList` endpoint.
 * Browser-side calls (the interactive panels) live in `apiAccessClient.ts`;
 * both share the same DTO shapes.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { AstroGlobal } from "astro";
import { backendUrl, internalHeaders } from "@/lib/api";
import type { ApiClientDto } from "@/lib/apiAccessClient";

/** Session cookie name, in lockstep with `session.ts` / the backend. */
const SESSION_COOKIE_NAME = "mc_dev_session";

/**
 * Loads the caller's own API clients (with tokens) server-side for SSR
 * rendering. Returns `null` on a missing session or any fetch failure so the
 * page can branch without a try/catch, distinguishing "no clients" (`[]`)
 * from "could not load" (`null`).
 *
 * @param astro - The Astro global; only `cookies` and `clientAddress` are read.
 * @returns The client list, or `null` when the data could not be loaded.
 */
export async function getOwnApiClients(astro: AstroGlobal): Promise<ApiClientDto[] | null> {
  const sessionCookie = astro.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.apiAccess.clientsList), {
      headers: internalHeaders(astro.clientAddress, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { clients: ApiClientDto[] };
    return data.clients;
  } catch {
    return null;
  }
}
