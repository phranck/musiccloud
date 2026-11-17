/**
 * @file Asks the site for a payment reference, or corrects what was sent under one.
 *
 * Both go through the site's own proxies, `/api/sponsorships` and
 * `/api/sponsorships/:reference`, so the visitor's browser asks no other host.
 * Kept out of the form, as the sponsors list is kept out of the wall.
 */

import {
  ENDPOINTS,
  normalizeSponsorshipReference,
  type PendingSponsorshipInput,
  type PendingSponsorshipReceipt,
  parseApiErrorResponse,
} from "@musiccloud/shared";

/**
 * How a request ended.
 *
 * - `Issued`: the site answered with a reference.
 * - `Refused`: the site answered with a refusal, or with something that is not a receipt.
 * - `Unreachable`: no answer arrived, such as when the visitor is offline.
 */
export const SponsorshipRequestOutcome = {
  Issued: "issued",
  Refused: "refused",
  Unreachable: "unreachable",
} as const;

/**
 * What {@link sendSponsorshipRequest} resolves to, by {@link SponsorshipRequestOutcome}.
 *
 * A refusal carries the backend's message, which ends with its `MC-*` code, and
 * its error ID. Either is absent where the answer did not carry it, such as a
 * gateway's error page.
 */
export type SponsorshipRequestResult =
  | { outcome: typeof SponsorshipRequestOutcome.Issued; receipt: PendingSponsorshipReceipt }
  | { outcome: typeof SponsorshipRequestOutcome.Refused; message?: string; errorId?: string }
  | { outcome: typeof SponsorshipRequestOutcome.Unreachable };

/**
 * Reads a receipt, keeping it only when its reference is one of ours.
 *
 * @param body - The parsed answer.
 * @returns The receipt, or `null` when the answer is not one.
 */
function readReceipt(body: unknown): PendingSponsorshipReceipt | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Partial<Record<keyof PendingSponsorshipReceipt, unknown>>;
  const reference = typeof candidate.reference === "string" ? normalizeSponsorshipReference(candidate.reference) : null;
  if (!reference || typeof candidate.referenceFormatted !== "string") return null;
  return { reference, referenceFormatted: candidate.referenceFormatted };
}

/**
 * Sends what somebody said about themselves and asks for a reference, or
 * rewrites what stands under the reference they already have.
 *
 * @param input - The request, its texts trimmed.
 * @param reference - The reference already issued, which turns the request into
 *   a correction (`PUT`); absent asks for a new one (`POST`).
 * @returns How the request ended. It never rejects.
 */
export async function sendSponsorshipRequest(
  input: PendingSponsorshipInput,
  reference?: string,
): Promise<SponsorshipRequestResult> {
  let response: Response;
  try {
    response = await fetch(
      reference ? ENDPOINTS.frontend.sponsorshipDetail(reference) : ENDPOINTS.frontend.sponsorships,
      {
        method: reference ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
  } catch {
    return { outcome: SponsorshipRequestOutcome.Unreachable };
  }

  const body: unknown = await response.json().catch(() => null);
  const receipt = response.ok ? readReceipt(body) : null;
  if (receipt) return { outcome: SponsorshipRequestOutcome.Issued, receipt };

  const refusal = parseApiErrorResponse(body);
  return { outcome: SponsorshipRequestOutcome.Refused, message: refusal.message, errorId: refusal.errorId };
}
