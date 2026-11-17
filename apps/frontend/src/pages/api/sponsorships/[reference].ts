import { type McErrorCode, normalizeSponsorshipReference } from "@musiccloud/shared";
import type { APIRoute } from "astro";

import { updateSponsorshipRequest } from "@/api/client";
import { relaySponsorshipRequest, sponsorshipErrorResponse } from "@/lib/support/sponsorship-proxy";

export const prerender = false;

/** The status a reference that cannot be ours is answered with: 404, as the backend answers an unknown one. */
const UNKNOWN_REFERENCE_STATUS = 404;

/** The code that answer carries: `MC-RES-0003`, the backend's code for an unknown reference. */
const UNKNOWN_REFERENCE_CODE: McErrorCode = "MC-RES-0003";

/**
 * Astro proxy for the backend's `PUT /api/v1/sponsorships/:reference`, so the
 * sponsor form corrects what was sent under a reference on the site's own
 * origin.
 *
 * A reference that is not a sound musiccloud sponsorship reference is answered
 * `404` with `MC-RES-0003` without asking the backend, as the sponsor avatar
 * proxy answers an id that cannot be one. Everything else goes through
 * {@link relaySponsorshipRequest}, with the reference in the form it is stored.
 */
export const PUT: APIRoute = async ({ params, request, clientAddress }) => {
  const reference = normalizeSponsorshipReference(params.reference ?? "");
  if (!reference) return sponsorshipErrorResponse(UNKNOWN_REFERENCE_STATUS, UNKNOWN_REFERENCE_CODE);
  return relaySponsorshipRequest(request, (body) => updateSponsorshipRequest(reference, body, clientAddress));
};
