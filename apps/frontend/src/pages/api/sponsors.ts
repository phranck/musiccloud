import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchSponsors } from "@/api/client";

export const prerender = false;

/** The response headers the backend sets on the list and the site passes on unchanged. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control"];

/**
 * Astro proxy for the backend's `/api/v1/sponsors`, so the sponsor wall reads
 * who carries this year from the site's own origin and a visitor's browser
 * asks no other host for it.
 *
 * The backend's status passes through, and an unreachable backend is answered
 * 503, which the wall shows as no sponsors rather than as an error.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  try {
    const upstream = await fetchSponsors(visitorAddress({ request, clientAddress }));
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(await upstream.text(), { status: 200, headers });
  } catch {
    return new Response(null, { status: 503 });
  }
};
