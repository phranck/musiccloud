/**
 * @file Where the invitation page goes once its link has been redeemed, and
 * what it says when the link no longer works.
 *
 * Kept apart from the island so the decision can be tested without rendering.
 */
import {
  PortalInvitationNext,
  type PortalInvitationNextValue,
  PortalInvitationRefusal,
  type PortalInvitationRefusalValue,
} from "@musiccloud/shared";

import type { AuthResult } from "./authClient";

/** The page each destination the backend names opens. */
const DESTINATION_PATH: Record<PortalInvitationNextValue, string> = {
  [PortalInvitationNext.Dashboard]: "/dashboard",
  [PortalInvitationNext.SignUp]: "/signup",
  [PortalInvitationNext.SignIn]: "/login",
};

/** What the page says about a link that no longer works. */
export interface InvitationRefusalCopy {
  title: string;
  body: string;
  /** Whether to offer the sign-in page, which helps where the person may already have an account. */
  offerSignIn: boolean;
}

const REFUSAL_COPY: Record<PortalInvitationRefusalValue, InvitationRefusalCopy> = {
  [PortalInvitationRefusal.Expired]: {
    title: "Invitation expired",
    body: "This invitation has run out. Ask whoever invited you to send a new one.",
    offerSignIn: false,
  },
  [PortalInvitationRefusal.Used]: {
    title: "Invitation already used",
    body: "This invitation has been followed already. If that was you, sign in with the account you used.",
    offerSignIn: true,
  },
  [PortalInvitationRefusal.Withdrawn]: {
    title: "Invitation withdrawn",
    body: "This invitation was taken back, so it no longer opens the portal.",
    offerSignIn: false,
  },
  [PortalInvitationRefusal.Unknown]: {
    title: "Invitation not found",
    body: "This link does not belong to an invitation. Please use the link from your email.",
    offerSignIn: false,
  },
};

/** What the page says when the redemption failed for any other reason. */
const FAILURE_COPY: InvitationRefusalCopy = {
  title: "Invitation could not be opened",
  body: "Something went wrong while opening your invitation. Please try the link again.",
  offerSignIn: false,
};

/**
 * Whether a value is one of the destinations the backend names.
 *
 * @param value - What the response carried as `next`.
 * @returns Whether it is a known destination.
 */
function isDestination(value: unknown): value is PortalInvitationNextValue {
  return typeof value === "string" && Object.hasOwn(DESTINATION_PATH, value);
}

/**
 * Whether a value is one of the reasons the backend gives for a refused link.
 *
 * @param value - What the response carried as `reason`.
 * @returns Whether it is a known reason.
 */
function isRefusal(value: unknown): value is PortalInvitationRefusalValue {
  return typeof value === "string" && Object.hasOwn(REFUSAL_COPY, value);
}

/**
 * The page to open after a redemption that worked.
 *
 * @param result - What the redemption call answered.
 * @returns The path to open, or `null` when the call did not work or named no
 *   destination this page knows.
 */
export function invitationDestination(result: AuthResult): string | null {
  if (!result.ok) return null;
  const next = (result.data as { next?: unknown } | undefined)?.next;
  return isDestination(next) ? DESTINATION_PATH[next] : null;
}

/**
 * What to say about a redemption that did not work.
 *
 * @param result - What the redemption call answered.
 * @returns The copy for the reason the backend gave, or the general failure.
 */
export function invitationRefusalCopy(result: AuthResult): InvitationRefusalCopy {
  const reason = (result.data as { reason?: unknown } | undefined)?.reason;
  return isRefusal(reason) ? REFUSAL_COPY[reason] : FAILURE_COPY;
}
