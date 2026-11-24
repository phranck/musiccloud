import { SPONSOR_AVATAR_ID_PATTERN, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchSponsorAvatar } from "@/api/client";
import { backendUnavailableResponse, notFoundResponse, relayErrorResponse, relayHeaders } from "@/api/proxy-response";

export const prerender = false;

/** A picture's id as the backend accepts it, checked before a request leaves the site. */
const AVATAR_ID = new RegExp(SPONSOR_AVATAR_ID_PATTERN);

/** The response headers the backend sets on a picture and the site passes on unchanged. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control", "X-Content-Type-Options", "Content-Security-Policy"];

/** This route's name in the log line of a picture whose body breaks off. */
const OPERATION = "sponsor_avatar_proxy";

/**
 * Astro proxy for the backend's `/api/v1/sponsor-avatars/:avatarId`, so the
 * support page loads a sponsor's picture from the site's own origin and a
 * visitor's browser asks no other host for it.
 *
 * An id that is not a SHA-256 in hex is answered 404 with `MC-RES-0003`
 * without asking the backend. A backend refusal passes on with its status and
 * error body, which is the backend client's envelope when the backend could
 * not be reached, and a picture whose body breaks off is answered 503 with
 * `MC-SYS-0002`.
 */
export const GET: APIRoute = async ({ request, params, clientAddress }) => {
  const avatarId = params.avatarId ?? "";
  if (!AVATAR_ID.test(avatarId)) return notFoundResponse();

  try {
    const upstream = await fetchSponsorAvatar(avatarId, visitorAddress({ request, clientAddress }));
    if (!upstream.ok) return relayErrorResponse(upstream);
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: relayHeaders(upstream, FORWARDED_HEADERS),
    });
  } catch (error) {
    return backendUnavailableResponse(error, OPERATION);
  }
};
