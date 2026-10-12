/**
 * @file Invitations into the developer portal while it is closed, and the
 * access they give.
 *
 * An invitation is a link sent to an address. Following it once admits
 * whoever holds it: a signed-in account receives the grant at once, and
 * anybody else receives a pass that opens sign-up and ends on the account
 * they sign up or sign in with. The grant is `portal_access_granted_at` on
 * that account, and an invitation remembers the account it ended on, so
 * withdrawing the invitation takes the access back.
 *
 * Only the SHA-256 of a link's token is stored, as for the verification and
 * reset links (see `generateEmailToken`).
 */
import {
  EmailAction,
  EmailRecipientKind,
  type PortalInvitation,
  PortalInvitationRefusal,
  type PortalInvitationRefusalValue,
  PortalInvitationState,
  type PortalInvitationStateValue,
} from "@musiccloud/shared";
import { nanoid } from "nanoid";
import type { PoolClient } from "pg";

import { getDatabasePool } from "../db/pool.js";
import { requireEnv } from "../lib/env.js";
import { generateEmailToken, hashEmailToken } from "./developer-auth.js";
import { triggerEmailAction } from "./email-actions.js";

/**
 * How long an invitation link works, in days.
 *
 * Two weeks, because an invitation waits for somebody else's calendar rather
 * than for a form they have open, and the link is spent on first use anyway.
 */
export const PORTAL_INVITATION_TTL_DAYS = 14;

/** One day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The mail could not be sent, so the invitation was not stored either. */
export class PortalInvitationMailError extends Error {
  constructor(cause: unknown) {
    super("The invitation mail could not be sent.", { cause });
    this.name = "PortalInvitationMailError";
  }
}

interface InvitationRow {
  id: string;
  email: string;
  expires_at: Date;
  created_at: Date;
  sent_at: Date;
  redeemed_at: Date | null;
  revoked_at: Date | null;
  account_id: string | null;
  account_email: string | null;
  sent_by: string | null;
}

/** Every invitation with the account it is bound to and the admin who sent it. */
const INVITATION_SELECT = `
  SELECT invitation.id, invitation.email, invitation.expires_at, invitation.created_at, invitation.sent_at,
         invitation.redeemed_at, invitation.revoked_at, invitation.account_id,
         account.email AS account_email, sender.username AS sent_by
  FROM developer_portal_invitations invitation
  LEFT JOIN developer_accounts account ON account.id = invitation.account_id
  LEFT JOIN admin_users sender ON sender.id = invitation.created_by_admin_id`;

/**
 * Where an invitation stands.
 *
 * Withdrawn wins over everything, because a withdrawn invitation admits
 * nobody whatever happened before. Used wins over expired, because a link
 * followed in time stays followed.
 *
 * @param row - The stored invitation.
 * @param now - The moment to judge expiry against.
 * @returns Its state.
 */
function invitationState(
  row: Pick<InvitationRow, "expires_at" | "redeemed_at" | "revoked_at">,
  now: number,
): PortalInvitationStateValue {
  if (row.revoked_at) return PortalInvitationState.Withdrawn;
  if (row.redeemed_at) return PortalInvitationState.Used;
  if (row.expires_at.getTime() <= now) return PortalInvitationState.Expired;
  return PortalInvitationState.Open;
}

/**
 * Shapes a stored invitation for the dashboard.
 *
 * @param row - The stored invitation with its joins.
 * @param now - The moment to judge expiry against.
 * @returns The invitation as the owner's list shows it.
 */
function toPortalInvitation(row: InvitationRow, now: number): PortalInvitation {
  return {
    id: row.id,
    email: row.email,
    state: invitationState(row, now),
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    usedAt: row.redeemed_at?.toISOString() ?? null,
    withdrawnAt: row.revoked_at?.toISOString() ?? null,
    account: row.account_id && row.account_email ? { id: row.account_id, email: row.account_email } : null,
    sentBy: row.sent_by,
  };
}

/**
 * Lists every invitation, the most recently sent first.
 *
 * @returns The owner's list.
 */
export async function listPortalInvitations(): Promise<PortalInvitation[]> {
  const result = await getDatabasePool().query<InvitationRow>(`${INVITATION_SELECT} ORDER BY invitation.sent_at DESC`);
  const now = Date.now();
  return result.rows.map((row) => toPortalInvitation(row, now));
}

/**
 * Reads one invitation through a client that may be inside a transaction.
 *
 * @param client - The client to read through.
 * @param id - The invitation.
 * @returns The invitation, or `null` where there is none.
 */
async function readPortalInvitation(client: Pick<PoolClient, "query">, id: string): Promise<PortalInvitation | null> {
  const result = await client.query<InvitationRow>(`${INVITATION_SELECT} WHERE invitation.id = $1`, [id]);
  const row = result.rows[0];
  return row ? toPortalInvitation(row, Date.now()) : null;
}

/**
 * Writes the grant onto an account, keeping the moment of the first one.
 *
 * @param client - The transaction's client.
 * @param accountId - The account to admit.
 */
async function grantPortalAccess(client: PoolClient, accountId: string): Promise<void> {
  await client.query(
    `UPDATE developer_accounts
     SET portal_access_granted_at = COALESCE(portal_access_granted_at, $1), updated_at = $1
     WHERE id = $2`,
    [new Date(), accountId],
  );
}

/**
 * Runs a function inside one transaction and gives the client back afterwards.
 *
 * @param work - What to do with the transaction's client.
 * @returns Whatever `work` returns, once committed.
 * @throws Whatever `work` throws, after rolling back.
 */
async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mails an invitation link.
 *
 * @param email - The invited address.
 * @param displayName - The name of the account that address already has, if any.
 * @param rawToken - The link's token, which exists nowhere but in this mail.
 * @throws {PortalInvitationMailError} When the mail cannot be sent, most often
 *   because no enabled template is bound to the action.
 */
async function sendInvitationMail(email: string, displayName: string | null, rawToken: string): Promise<void> {
  try {
    await triggerEmailAction(EmailAction.DeveloperPortalInviteSent, {
      to: { email },
      recipient: { kind: EmailRecipientKind.DeveloperAccount, email, displayName },
      context: { inviteUrl: `${requireEnv("DEVELOPER_URL")}/invite?token=${rawToken}` },
    });
  } catch (error) {
    throw new PortalInvitationMailError(error);
  }
}

/**
 * Invites an address, or sends its open invitation again.
 *
 * An address has at most one open invitation, so inviting it again gives that
 * one a new link and a new expiry. Where the address already has an account,
 * the grant is written onto it now and the invitation is bound to it; the mail
 * still goes out, so the person knows. The rows and the mail are one step:
 * when the mail fails, nothing is stored.
 *
 * @param email - The address, already normalized.
 * @param adminId - The owner sending it.
 * @returns The invitation as it now stands.
 * @throws {PortalInvitationMailError} When the mail cannot be sent.
 */
export async function invitePortalDeveloper(email: string, adminId: string): Promise<PortalInvitation> {
  return inTransaction(async (client) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PORTAL_INVITATION_TTL_DAYS * DAY_MS);
    const { raw, hash } = generateEmailToken();

    const open = await client.query<{ id: string; account_id: string | null }>(
      `SELECT id, account_id FROM developer_portal_invitations
       WHERE email = $1 AND redeemed_at IS NULL AND revoked_at IS NULL
       FOR UPDATE`,
      [email],
    );
    let invitation = open.rows[0];
    if (invitation) {
      await client.query(
        `UPDATE developer_portal_invitations SET token_hash = $1, expires_at = $2, sent_at = $3 WHERE id = $4`,
        [hash, expiresAt, now, invitation.id],
      );
    } else {
      invitation = { id: nanoid(), account_id: null };
      await client.query(
        `INSERT INTO developer_portal_invitations (id, email, token_hash, expires_at, created_by_admin_id, created_at, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [invitation.id, email, hash, expiresAt, adminId, now],
      );
    }

    const existing = await client.query<{ id: string; display_name: string | null }>(
      "SELECT id, display_name FROM developer_accounts WHERE email = $1",
      [email],
    );
    const account = existing.rows[0];
    if (account && invitation.account_id === null) {
      await client.query("UPDATE developer_portal_invitations SET account_id = $1 WHERE id = $2", [
        account.id,
        invitation.id,
      ]);
      await grantPortalAccess(client, account.id);
    }

    await sendInvitationMail(email, account?.display_name ?? null, raw);
    return (await readPortalInvitation(client, invitation.id)) as PortalInvitation;
  });
}

/** What sending an invitation again found. */
export type PortalInvitationResend = { invitation: PortalInvitation } | { missing: true } | { notOpen: true };

/**
 * Sends an open invitation again, with a new link and a new expiry.
 *
 * The old link stops working, because only one token hash is stored. An
 * invitation that was followed or withdrawn is not open, and the owner
 * invites the address again instead.
 *
 * @param id - The invitation.
 * @returns The invitation as it now stands, or why it was not sent.
 * @throws {PortalInvitationMailError} When the mail cannot be sent.
 */
export async function resendPortalInvitation(id: string): Promise<PortalInvitationResend> {
  return inTransaction(async (client) => {
    const found = await client.query<{ email: string; redeemed_at: Date | null; revoked_at: Date | null }>(
      "SELECT email, redeemed_at, revoked_at FROM developer_portal_invitations WHERE id = $1 FOR UPDATE",
      [id],
    );
    const row = found.rows[0];
    if (!row) return { missing: true };
    if (row.redeemed_at || row.revoked_at) return { notOpen: true };

    const now = new Date();
    const { raw, hash } = generateEmailToken();
    await client.query(
      "UPDATE developer_portal_invitations SET token_hash = $1, expires_at = $2, sent_at = $3 WHERE id = $4",
      [hash, new Date(now.getTime() + PORTAL_INVITATION_TTL_DAYS * DAY_MS), now, id],
    );
    const account = await client.query<{ display_name: string | null }>(
      "SELECT display_name FROM developer_accounts WHERE email = $1",
      [row.email],
    );
    await sendInvitationMail(row.email, account.rows[0]?.display_name ?? null, raw);
    return { invitation: (await readPortalInvitation(client, id)) as PortalInvitation };
  });
}

/**
 * Withdraws an invitation, together with the access it gave.
 *
 * The bound account loses its grant unless another invitation that is not
 * withdrawn is bound to it as well. Withdrawing twice changes nothing the
 * second time.
 *
 * @param id - The invitation.
 * @returns The invitation as it now stands, or `null` where there is none.
 */
export async function withdrawPortalInvitation(id: string): Promise<PortalInvitation | null> {
  return inTransaction(async (client) => {
    const withdrawn = await client.query<{ account_id: string | null }>(
      `UPDATE developer_portal_invitations SET revoked_at = $1
       WHERE id = $2 AND revoked_at IS NULL
       RETURNING account_id`,
      [new Date(), id],
    );
    const accountId = withdrawn.rows[0]?.account_id;
    if (accountId) {
      await client.query(
        `UPDATE developer_accounts SET portal_access_granted_at = NULL, updated_at = $1
         WHERE id = $2
           AND NOT EXISTS (
             SELECT 1 FROM developer_portal_invitations
             WHERE account_id = $2 AND revoked_at IS NULL
           )`,
        [new Date(), accountId],
      );
    }
    return readPortalInvitation(client, id);
  });
}

/** An invitation whose link has just been followed. */
export interface RedeemedPortalInvitation {
  id: string;
  email: string;
  /** The account it is already bound to, which is the case where the address had one when it was sent. */
  accountId: string | null;
}

/** What following an invitation link found. */
export type PortalInvitationRedeemResult =
  | { invitation: RedeemedPortalInvitation }
  | { refusal: PortalInvitationRefusalValue };

/**
 * Claims an invitation by the token in its link.
 *
 * The claim is one conditional update, so two requests carrying the same link
 * cannot both win. A link that admits nobody says why, because the person
 * holding it needs to know whether to ask again.
 *
 * @param rawToken - The token from the link.
 * @returns The claimed invitation, or why the link no longer works.
 */
export async function redeemPortalInvitation(rawToken: string): Promise<PortalInvitationRedeemResult> {
  const pool = getDatabasePool();
  const tokenHash = hashEmailToken(rawToken);
  const now = new Date();

  const claimed = await pool.query<{ id: string; email: string; account_id: string | null }>(
    `UPDATE developer_portal_invitations SET redeemed_at = $1
     WHERE token_hash = $2 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > $1
     RETURNING id, email, account_id`,
    [now, tokenHash],
  );
  const row = claimed.rows[0];
  if (row) return { invitation: { id: row.id, email: row.email, accountId: row.account_id } };

  const found = await pool.query<Pick<InvitationRow, "expires_at" | "redeemed_at" | "revoked_at">>(
    "SELECT expires_at, redeemed_at, revoked_at FROM developer_portal_invitations WHERE token_hash = $1",
    [tokenHash],
  );
  const stored = found.rows[0];
  if (!stored) return { refusal: PortalInvitationRefusal.Unknown };
  const state = invitationState(stored, now.getTime());
  if (state === PortalInvitationState.Withdrawn) return { refusal: PortalInvitationRefusal.Withdrawn };
  if (state === PortalInvitationState.Used) return { refusal: PortalInvitationRefusal.Used };
  return { refusal: PortalInvitationRefusal.Expired };
}

/**
 * Binds a followed invitation to an account and writes the grant onto it.
 *
 * Only an invitation that was followed, is not withdrawn, and is bound to no
 * account yet can be bound, so a pass works once.
 *
 * @param invitationId - The invitation the pass names.
 * @param accountId - The account the person signed up or signed in with.
 * @returns Whether the invitation was bound by this call.
 */
export async function bindPortalInvitation(invitationId: string, accountId: string): Promise<boolean> {
  return inTransaction(async (client) => {
    const bound = await client.query(
      `UPDATE developer_portal_invitations SET account_id = $1
       WHERE id = $2 AND account_id IS NULL AND redeemed_at IS NOT NULL AND revoked_at IS NULL`,
      [accountId, invitationId],
    );
    if ((bound.rowCount ?? 0) === 0) return false;
    await grantPortalAccess(client, accountId);
    return true;
  });
}

/**
 * The invitation a pass names, while the pass still opens sign-up.
 *
 * That is between the link being followed and the invitation being bound to
 * an account, unless it is withdrawn in between.
 *
 * @param invitationId - The invitation the pass names.
 * @returns The invited address, or `null` when the pass no longer opens anything.
 */
export async function readOpenPortalInvitationPass(invitationId: string): Promise<{ email: string } | null> {
  const result = await getDatabasePool().query<{ email: string }>(
    `SELECT email FROM developer_portal_invitations
     WHERE id = $1 AND redeemed_at IS NOT NULL AND revoked_at IS NULL AND account_id IS NULL`,
    [invitationId],
  );
  return result.rows[0] ?? null;
}
