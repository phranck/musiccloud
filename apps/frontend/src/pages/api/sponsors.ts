import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchSponsors } from "@/api/client";
import { backendUnavailableResponse, relayErrorResponse, relayHeaders } from "@/api/proxy-response";

export const prerender = false;

/** The response headers the backend sets on the list and the site passes on unchanged. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control"];

/** This route's name in the log line of a list whose body breaks off. */
const OPERATION = "sponsors_proxy";

/**
 * Astro proxy for the backend's `/api/v1/sponsors`, so the sponsor wall reads
 * who carries this year from the site's own origin and a visitor's browser
 * asks no other host for it.
 *
 * A backend refusal passes on with its status and error body, which is the
 * backend client's envelope when the backend could not be reached. A list
 * whose body breaks off is answered 503 with `MC-SYS-0002`. The wall shows
 * any refusal as no sponsors rather than as an error.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  try {
    const upstream = await fetchSponsors(visitorAddress({ request, clientAddress }));
    if (!upstream.ok) return relayErrorResponse(upstream);
    return new Response(await upstream.text(), { status: 200, headers: relayHeaders(upstream, FORWARDED_HEADERS) });
  } catch (error) {
    return backendUnavailableResponse(error, OPERATION);
  }
};
