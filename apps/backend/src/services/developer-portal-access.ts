/**
 * @file Who may use the developer API, and who may open an account, while the
 * portal is closed.
 *
 * The portal's gate decides what `developer.musiccloud.io` serves, but the
 * developer API answers at the backend's own host and through the dashboard's
 * proxy as well. These two questions are what keeps a closed portal closed
 * there too.
 */
import type { DeveloperAccount } from "../db/developer-repository.js";
import { readPortalAvailability } from "./developer-portal-availability.js";
import { readOpenPortalInvitationPass } from "./developer-portal-invitations.js";

/** The refusal both questions answer with. */
export const PORTAL_CLOSED_CODE = "MC-AUTH-0004";

/**
 * Whether an account may use the developer API now.
 *
 * An account an invitation admitted always may, so it never reads the
 * portal's state. Any other may while the portal is public.
 *
 * @param account - The signed-in account.
 * @returns Whether its requests may proceed.
 */
export async function mayUseDeveloperApi(account: Pick<DeveloperAccount, "portalAccessGrantedAt">): Promise<boolean> {
  if (account.portalAccessGrantedAt !== null) return true;
  return (await readPortalAvailability()).public;
}

/**
 * Whether a new account may be opened now.
 *
 * Always while the portal is public. While it is closed, only for a request
 * carrying a pass whose invitation still opens sign-up, because that is the
 * one person the owner let in.
 *
 * @param passInvitationId - The invitation the request's pass names, or `null`.
 * @returns Whether the account may be created.
 */
export async function mayCreateDeveloperAccount(passInvitationId: string | null): Promise<boolean> {
  if ((await readPortalAvailability()).public) return true;
  return passInvitationId !== null && (await readOpenPortalInvitationPass(passInvitationId)) !== null;
}
