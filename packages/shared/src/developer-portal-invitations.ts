/**
 * @file Invitations into the developer portal while it is closed, as the
 * backend answers about them and the dashboard and the portal read them.
 *
 * An invitation admits whoever holds its link, once. What it admits lasts on
 * the account it ends up bound to, as that account's grant, so a person keeps
 * their access on any device and the owner withdraws it in one place.
 */

/** Where an invitation stands, as the dashboard lists it. */
export const PortalInvitationState = {
  /** Sent, and its link still works. */
  Open: "open",
  /** Its link was followed. */
  Used: "used",
  /** Nobody followed its link before it ran out. */
  Expired: "expired",
  /** The owner took it back, together with any access it gave. */
  Withdrawn: "withdrawn",
} as const;

/** One of the states in {@link PortalInvitationState}. */
export type PortalInvitationStateValue = (typeof PortalInvitationState)[keyof typeof PortalInvitationState];

/** One invitation, as the owner's list shows it. */
export interface PortalInvitation {
  id: string;
  /** The address the invitation was sent to. */
  email: string;
  state: PortalInvitationStateValue;
  /** When it was first sent, ISO 8601. */
  createdAt: string;
  /** When it was last sent, ISO 8601. Sending again moves this and the expiry. */
  sentAt: string;
  /** When its link stops working, ISO 8601. */
  expiresAt: string;
  /** When its link was followed, ISO 8601, or `null`. */
  usedAt: string | null;
  /** When it was withdrawn, ISO 8601, or `null`. */
  withdrawnAt: string | null;
  /**
   * The account holding the access this invitation gave, or `null` before it
   * is bound to one. An address that already had an account is bound when the
   * invitation is sent.
   */
  account: { id: string; email: string } | null;
  /** The username of the admin who sent it, or `null` once that admin is removed. */
  sentBy: string | null;
}

/** Why an invitation link no longer admits anybody. */
export const PortalInvitationRefusal = {
  /** Nobody followed it in time. */
  Expired: "expired",
  /** It has been followed already. */
  Used: "used",
  /** The owner took it back. */
  Withdrawn: "withdrawn",
  /** No invitation carries this link. */
  Unknown: "unknown",
} as const;

/** One of the reasons in {@link PortalInvitationRefusal}. */
export type PortalInvitationRefusalValue = (typeof PortalInvitationRefusal)[keyof typeof PortalInvitationRefusal];

/** Where a person goes once their invitation link has worked. */
export const PortalInvitationNext = {
  /** They were signed in, and the grant is on their account. */
  Dashboard: "dashboard",
  /** They have no account yet, and hold the pass that opens sign-up. */
  SignUp: "sign-up",
  /** Their address already had an account, which carries the grant. */
  SignIn: "sign-in",
} as const;

/** One of the destinations in {@link PortalInvitationNext}. */
export type PortalInvitationNextValue = (typeof PortalInvitationNext)[keyof typeof PortalInvitationNext];

/** What redeeming an invitation link answers when it works. */
export interface PortalInvitationRedemption {
  next: PortalInvitationNextValue;
  /** The address the invitation was sent to. */
  email: string;
}

/**
 * Name of the httpOnly cookie carrying an invitation pass, which opens
 * sign-up while the portal is closed. The backend sets and reads it, and the
 * portal forwards it, so both take the name from here.
 */
export const INVITATION_PASS_COOKIE_NAME = "mc_dev_invite_pass";

/**
 * What the backend answers when the portal's gate asks about a pass.
 *
 * The address travels with the answer so the sign-up form can start with it,
 * rather than in the page's address where logs and histories would keep it.
 */
export type PortalInvitationPass = { valid: true; email: string } | { valid: false; email: null };
