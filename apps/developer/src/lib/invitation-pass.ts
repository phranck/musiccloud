/**
 * @file Whether a request carries an invitation pass that still opens sign-up.
 *
 * Only the backend holds the key a pass is signed with, so the portal forwards
 * the cookie and asks. A request without the cookie costs no call at all.
 */
import { ENDPOINTS, INVITATION_PASS_COOKIE_NAME, type PortalInvitationPass } from "@musiccloud/shared";

import { backendUrl, internalHeaders } from "./api";
import { logFailClosedRead } from "./fail-closed-read";
import type { SessionRequestContext } from "./session";

/** How long the gate waits for the backend's answer about a pass. */
const PASS_TIMEOUT_MS = 2_000;

/** The operation the pass read logs under. */
const PASS_READ = "developer_portal_invitation_pass_read";

/**
 * Reads the invitation behind a request's pass.
 *
 * Every failure, whether the backend is unreachable, answers with an error,
 * or answers with something that is not the expected shape, counts as no
 * pass, so the gate stays closed.
 *
 * @param context - The middleware's context; only `cookies` and `clientAddress` are read.
 * @returns The invited address, or `null` when there is no pass that opens sign-up.
 */
export async function readInvitationPass(context: SessionRequestContext): Promise<{ email: string } | null> {
  const pass = context.cookies.get(INVITATION_PASS_COOKIE_NAME)?.value;
  if (!pass) return null;

  try {
    const response = await fetch(backendUrl(ENDPOINTS.internal.developer.invitationPass), {
      headers: internalHeaders(context.clientAddress, { cookie: `${INVITATION_PASS_COOKIE_NAME}=${pass}` }),
      signal: AbortSignal.timeout(PASS_TIMEOUT_MS),
    });
    if (!response.ok) {
      logFailClosedRead(PASS_READ, { reason: "unexpected_status", status: response.status });
      return null;
    }
    const payload = (await response.json()) as Partial<PortalInvitationPass>;
    if (payload.valid === true && typeof payload.email === "string") return { email: payload.email };
    if (payload.valid !== false) logFailClosedRead(PASS_READ, { reason: "invalid_payload" });
    return null;
  } catch (error) {
    logFailClosedRead(PASS_READ, {
      cause: error instanceof Error ? error.name : "UnknownError",
      reason: "request_failed",
    });
    return null;
  }
}
