import { SPONSOR_AVATAR_ID_PATTERN, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchSponsorAvatar } from "@/api/client";

export const prerender = false;

/** A picture's id as the backend accepts it, checked before a request leaves the site. */
const AVATAR_ID = new RegExp(SPONSOR_AVATAR_ID_PATTERN);

/** The response headers the backend sets on a picture and the site passes on unchanged. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control", "X-Content-Type-Options", "Content-Security-Policy"];

/**
 * Astro proxy for the backend's `/api/v1/sponsor-avatars/:avatarId`, so the
 * support page loads a sponsor's picture from the site's own origin and a
 * visitor's browser asks no other host for it.
 *
 * An id that is not a SHA-256 in hex is answered 404 without asking the
 * backend, and the backend's own status passes through otherwise.
 */
export const GET: APIRoute = async ({ request, params, clientAddress }) => {
  const avatarId = params.avatarId ?? "";
  if (!AVATAR_ID.test(avatarId)) return new Response(null, { status: 404 });

  try {
    const upstream = await fetchSponsorAvatar(avatarId, visitorAddress({ request, clientAddress }));
    if (!upstream.ok) return new Response(null, { status: upstream.status });
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(await upstream.arrayBuffer(), { status: 200, headers });
  } catch {
    return new Response(null, { status: 503 });
  }
};
