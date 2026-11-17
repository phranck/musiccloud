import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

import { createSponsorshipRequest } from "@/api/client";
import { relaySponsorshipRequest } from "@/lib/support/sponsorship-proxy";

export const prerender = false;

/**
 * Astro proxy for the backend's `POST /api/v1/sponsorships`, so the sponsor
 * form asks for a payment reference on the site's own origin.
 *
 * The body is bounded and passed on, the visitor's address goes with it for
 * the backend's limit of five requests an hour, and the backend's answer comes
 * back unchanged apart from `Cache-Control: no-store`. See
 * {@link relaySponsorshipRequest}.
 */
export const POST: APIRoute = async ({ request, clientAddress }) =>
  relaySponsorshipRequest(request, (body) =>
    createSponsorshipRequest(body, visitorAddress({ request, clientAddress })),
  );
