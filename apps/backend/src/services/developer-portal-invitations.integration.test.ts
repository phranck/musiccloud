import { EmailAction, PortalInvitationRefusal, PortalInvitationState } from "@musiccloud/shared";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { integrationDatabaseUrl } from "../__tests__/integration-database.js";

const session = vi.hoisted(() => ({ client: null as import("pg").Client | null }));
const mail = vi.hoisted(() => ({ triggerEmailAction: vi.fn() }));

// The service reaches the database through the shared pool. Here the pool is
// this test's one session, so every query, the service's own transactions
// included, sees the temporary tables created below.
vi.mock("../db/pool.js", () => {
  const client = () => {
    if (!session.client) throw new Error("The integration session is not connected.");
    return session.client;
  };
  return {
    getDatabasePool: () => ({
      query: (text: string, values?: unknown[]) => client().query(text, values),
      connect: async () => ({
        query: (text: string, values?: unknown[]) => client().query(text, values),
        release: () => undefined,
      }),
    }),
  };
});

vi.mock("./email-actions.js", () => ({ triggerEmailAction: mail.triggerEmailAction }));

process.env.DEVELOPER_URL = "https://developer.test";

const {
  bindPortalInvitation,
  invitePortalDeveloper,
  listPortalInvitations,
  PortalInvitationMailError,
  readOpenPortalInvitationPass,
  redeemPortalInvitation,
  resendPortalInvitation,
  withdrawPortalInvitation,
} = await import("./developer-portal-invitations.js");

/**
 * The service is held to what the dashboard, the redemption route and the
 * pass rely on: one open invitation per address, a link that works once, a
 * grant that lands on exactly one account and leaves with the invitation that
 * gave it, and nothing stored when the mail fails.
 *
 * Every table it touches is a temporary copy that shadows the real one for
 * this session only, so no stored row is read or written.
 */
describe.skipIf(!integrationDatabaseUrl())("developer portal invitations (integration)", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: integrationDatabaseUrl() });
    await client.connect();
    session.client = client;

    await client.query("CREATE TEMP TABLE admin_users (LIKE public.admin_users INCLUDING ALL)");
    await client.query("CREATE TEMP TABLE developer_accounts (LIKE public.developer_accounts INCLUDING ALL)");
    await client.query(
      "CREATE TEMP TABLE developer_portal_invitations (LIKE public.developer_portal_invitations INCLUDING ALL)",
    );

    const shadowing = await client.query<{ admins: boolean; accounts: boolean; invitations: boolean }>(
      `SELECT 'admin_users'::regclass = 'pg_temp.admin_users'::regclass AS admins,
              'developer_accounts'::regclass = 'pg_temp.developer_accounts'::regclass AS accounts,
              'developer_portal_invitations'::regclass = 'pg_temp.developer_portal_invitations'::regclass AS invitations`,
    );
    // The cases below may only run once every unqualified name resolves to a
    // temporary copy.
    expect(shadowing.rows[0]).toEqual({ admins: true, accounts: true, invitations: true });
  });

  beforeEach(async () => {
    await client.query(
      "TRUNCATE pg_temp.developer_portal_invitations, pg_temp.developer_accounts, pg_temp.admin_users",
    );
    await client.query(
      `INSERT INTO pg_temp.admin_users (id, username, password_hash, role, created_at)
       VALUES ('owner-a', 'olive', 'hash', 'owner', now())`,
    );
    mail.triggerEmailAction.mockReset();
    mail.triggerEmailAction.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    session.client = null;
    await client.end();
  });

  async function createAccount(id: string, email: string): Promise<void> {
    await client.query(
      `INSERT INTO pg_temp.developer_accounts (id, email, created_at, updated_at) VALUES ($1, $2, now(), now())`,
      [id, email],
    );
  }

  async function grantOf(accountId: string): Promise<Date | null> {
    const result = await client.query<{ portal_access_granted_at: Date | null }>(
      "SELECT portal_access_granted_at FROM pg_temp.developer_accounts WHERE id = $1",
      [accountId],
    );
    return result.rows[0]?.portal_access_granted_at ?? null;
  }

  /** The token the newest mail carried, read back out of its link. */
  function lastMailedToken(): string {
    const input = mail.triggerEmailAction.mock.calls.at(-1)?.[1] as { context: { inviteUrl: string } };
    return new URL(input.context.inviteUrl).searchParams.get("token") ?? "";
  }

  it("sends a link to a new address and lists the invitation as open", async () => {
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");

    expect(mail.triggerEmailAction).toHaveBeenCalledWith(
      EmailAction.DeveloperPortalInviteSent,
      expect.objectContaining({ to: { email: "new@example.com" } }),
    );
    expect(lastMailedToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invitation).toMatchObject({
      email: "new@example.com",
      state: PortalInvitationState.Open,
      account: null,
      sentBy: "olive",
    });
    await expect(listPortalInvitations()).resolves.toEqual([invitation]);
  });

  it("stores nothing when the mail cannot be sent", async () => {
    mail.triggerEmailAction.mockRejectedValue(new Error("no template bound"));

    await expect(invitePortalDeveloper("new@example.com", "owner-a")).rejects.toBeInstanceOf(PortalInvitationMailError);
    await expect(listPortalInvitations()).resolves.toEqual([]);
  });

  it("gives an open invitation a new link when the address is invited again", async () => {
    const first = await invitePortalDeveloper("new@example.com", "owner-a");
    const oldToken = lastMailedToken();
    const second = await invitePortalDeveloper("new@example.com", "owner-a");

    expect(second.id).toBe(first.id);
    await expect(listPortalInvitations()).resolves.toHaveLength(1);
    await expect(redeemPortalInvitation(oldToken)).resolves.toEqual({ refusal: PortalInvitationRefusal.Unknown });
    await expect(redeemPortalInvitation(lastMailedToken())).resolves.toMatchObject({ invitation: { id: first.id } });
  });

  it("grants an address that already has an account at once, and still mails it", async () => {
    await createAccount("acc-1", "known@example.com");

    const invitation = await invitePortalDeveloper("known@example.com", "owner-a");

    expect(invitation.account).toEqual({ id: "acc-1", email: "known@example.com" });
    expect(await grantOf("acc-1")).not.toBeNull();
    expect(mail.triggerEmailAction).toHaveBeenCalledTimes(1);
    await expect(redeemPortalInvitation(lastMailedToken())).resolves.toEqual({
      invitation: { id: invitation.id, email: "known@example.com", accountId: "acc-1" },
    });
  });

  it("admits a link once, and says it was used the second time", async () => {
    await invitePortalDeveloper("new@example.com", "owner-a");
    const token = lastMailedToken();

    await expect(redeemPortalInvitation(token)).resolves.toHaveProperty("invitation");
    await expect(redeemPortalInvitation(token)).resolves.toEqual({ refusal: PortalInvitationRefusal.Used });
    const [listed] = await listPortalInvitations();
    expect(listed?.state).toBe(PortalInvitationState.Used);
  });

  it("says a link has expired once its time is up", async () => {
    await invitePortalDeveloper("new@example.com", "owner-a");
    await client.query("UPDATE pg_temp.developer_portal_invitations SET expires_at = now() - interval '1 minute'");

    await expect(redeemPortalInvitation(lastMailedToken())).resolves.toEqual({
      refusal: PortalInvitationRefusal.Expired,
    });
    const [listed] = await listPortalInvitations();
    expect(listed?.state).toBe(PortalInvitationState.Expired);
  });

  it("binds a pass to the account it ends on, once, and closes it there", async () => {
    await createAccount("acc-1", "someone@example.com");
    await createAccount("acc-2", "someone-else@example.com");
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");
    await redeemPortalInvitation(lastMailedToken());

    await expect(readOpenPortalInvitationPass(invitation.id)).resolves.toEqual({ email: "new@example.com" });
    await expect(bindPortalInvitation(invitation.id, "acc-1")).resolves.toBe(true);
    await expect(bindPortalInvitation(invitation.id, "acc-2")).resolves.toBe(false);

    expect(await grantOf("acc-1")).not.toBeNull();
    expect(await grantOf("acc-2")).toBeNull();
    await expect(readOpenPortalInvitationPass(invitation.id)).resolves.toBeNull();
  });

  it("binds nothing for an invitation whose link was never followed", async () => {
    await createAccount("acc-1", "someone@example.com");
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");

    await expect(readOpenPortalInvitationPass(invitation.id)).resolves.toBeNull();
    await expect(bindPortalInvitation(invitation.id, "acc-1")).resolves.toBe(false);
    expect(await grantOf("acc-1")).toBeNull();
  });

  it("takes the access back with the invitation, unless another invitation gave it too", async () => {
    await createAccount("acc-1", "known@example.com");
    const first = await invitePortalDeveloper("known@example.com", "owner-a");
    await redeemPortalInvitation(lastMailedToken());
    const second = await invitePortalDeveloper("known@example.com", "owner-a");

    await withdrawPortalInvitation(first.id);
    expect(await grantOf("acc-1")).not.toBeNull();

    const withdrawn = await withdrawPortalInvitation(second.id);
    expect(withdrawn?.state).toBe(PortalInvitationState.Withdrawn);
    expect(await grantOf("acc-1")).toBeNull();
  });

  it("closes a withdrawn link and its pass, and withdraws twice without harm", async () => {
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");
    const token = lastMailedToken();

    await withdrawPortalInvitation(invitation.id);
    await expect(withdrawPortalInvitation(invitation.id)).resolves.toMatchObject({
      state: PortalInvitationState.Withdrawn,
    });
    await expect(redeemPortalInvitation(token)).resolves.toEqual({ refusal: PortalInvitationRefusal.Withdrawn });
    await expect(withdrawPortalInvitation("no-such-invitation")).resolves.toBeNull();
  });

  it("closes a pass that was handed out before the invitation was withdrawn", async () => {
    await createAccount("acc-1", "someone@example.com");
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");
    await redeemPortalInvitation(lastMailedToken());

    await withdrawPortalInvitation(invitation.id);

    await expect(readOpenPortalInvitationPass(invitation.id)).resolves.toBeNull();
    await expect(bindPortalInvitation(invitation.id, "acc-1")).resolves.toBe(false);
  });

  it("sends only an open invitation again", async () => {
    const invitation = await invitePortalDeveloper("new@example.com", "owner-a");
    const oldToken = lastMailedToken();

    const resent = await resendPortalInvitation(invitation.id);
    expect(resent).toHaveProperty("invitation");
    await expect(redeemPortalInvitation(oldToken)).resolves.toEqual({ refusal: PortalInvitationRefusal.Unknown });

    await redeemPortalInvitation(lastMailedToken());
    await expect(resendPortalInvitation(invitation.id)).resolves.toEqual({ notOpen: true });
    await expect(resendPortalInvitation("no-such-invitation")).resolves.toEqual({ missing: true });
  });

  it("leaves room for a new invitation once the open one is used", async () => {
    await invitePortalDeveloper("new@example.com", "owner-a");
    await redeemPortalInvitation(lastMailedToken());

    await invitePortalDeveloper("new@example.com", "owner-a");

    await expect(listPortalInvitations()).resolves.toHaveLength(2);
  });
});
