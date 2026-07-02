/**
 * @file Service tests for {@link triggerEmailAction} (MC-078). Drives the real
 * fan-out/validation logic against a fully-stubbed {@link AdminRepository} and
 * a mocked {@link sendEmail}, so no Postgres pool or SMTP2GO call is ever made.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** `triggerEmailAction`'s own logic (action lookup, binding
 *   fan-out, `enabled` filtering, required-variable validation, rendering via
 *   the real {@link renderEmailTemplate}).
 * - **Mocked:** the persistence layer (`getAdminRepository` from
 *   `../db/index.js`) and the transport (`sendEmail` from
 *   `./email-provider.js`), mirroring the mocking conventions already
 *   established for route/service tests in this codebase (see
 *   `../../routes/developer-auth.test.ts`: one `vi.mock` per dependency
 *   module, a `makeRepo()` factory returning `vi.fn()` stubs, and
 *   `vi.mocked(...).mockResolvedValue(...)` wiring in `beforeEach`).
 */

import { EmailBlockType } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRepository, EmailBrandingDto, EmailTemplateRow } from "../../db/admin-repository.js";
import { getAdminRepository } from "../../db/index.js";
import { triggerEmailAction } from "../email-actions.js";
import { sendEmail } from "../email-provider.js";

vi.mock("../../db/index.js", () => ({
  getAdminRepository: vi.fn(),
}));

vi.mock("../email-provider.js", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

/** `email_action_bindings` action key used by every case (`required: true` in the EMAIL_ACTIONS registry). */
const ADMIN_INVITE_SENT = "adminInviteSent";

/** Variables `adminInviteSent` supplies per the shared registry (`username`, `email`, `role`, `inviteUrl`, `loginUrl`). */
const ADMIN_INVITE_VARIABLES = {
  username: "alice",
  email: "alice@example.com",
  role: "admin",
  inviteUrl: "https://dashboard.musiccloud.io/invite/abc",
  loginUrl: "https://dashboard.musiccloud.io/login",
};

const RECIPIENT = { email: "alice@example.com", name: "Alice" };

const BRANDING: EmailBrandingDto = { headerAssetId: null, footerAssetId: null, footerText: null };

/**
 * Builds a fully-populated {@link EmailTemplateRow}, defaulting to a single
 * text block that references every `adminInviteSent` variable and declaring
 * all of them as required — the "happy path" shape most tests can use
 * unmodified.
 *
 * @param overrides - Partial fields to override the defaults.
 * @returns A complete email-template row.
 */
function makeTemplateRow(overrides: Partial<EmailTemplateRow> = {}): EmailTemplateRow {
  return {
    id: 1,
    name: "Admin invite",
    subject: "Welcome {{username}}",
    blocks: [{ type: EmailBlockType.Text, markdown: "Hi {{username}}, visit {{inviteUrl}}" }],
    requiredVariables: [
      { name: "username", description: "Invited admin's username" },
      { name: "inviteUrl", description: "Invite acceptance link" },
    ],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Creates a fully-stubbed {@link AdminRepository} where the three methods
 * `triggerEmailAction` calls are `vi.fn()` spies with benign defaults (no
 * bindings, default branding, template lookup miss). Tests override only the
 * calls relevant to the scenario. Cast via `unknown` because `AdminRepository`
 * carries many unrelated methods this suite never calls.
 *
 * @returns A repository stub satisfying the subset of `AdminRepository` this
 *   suite exercises.
 */
function makeRepo(): AdminRepository {
  return {
    listEmailActionBindings: vi.fn(async () => []),
    getEmailBranding: vi.fn(async () => BRANDING),
    getEmailTemplateById: vi.fn(async () => null),
  } as unknown as AdminRepository;
}

let repo: AdminRepository;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_URL", "http://localhost:4000");
  repo = makeRepo();
  vi.mocked(getAdminRepository).mockResolvedValue(repo);
});

describe("triggerEmailAction", () => {
  it("renders and sends the one enabled binding whose required variables are all supplied", async () => {
    const template = makeTemplateRow();
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(template);

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, variables: ADMIN_INVITE_VARIABLES });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.to).toEqual(RECIPIENT);
    expect(sent.subject).toBe("Welcome alice");
    expect(sent.html).toContain("Hi alice");
    expect(sent.html).toContain("https://dashboard.musiccloud.io/invite/abc");
  });

  it("fans out to two enabled bindings pointing at two different templates", async () => {
    const templateA = makeTemplateRow({ id: 1, name: "Template A", subject: "A: {{username}}" });
    const templateB = makeTemplateRow({ id: 2, name: "Template B", subject: "B: {{username}}" });
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
      { id: "bind-2", actionKey: ADMIN_INVITE_SENT, templateId: 2, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockImplementation(async (id) =>
      id === 1 ? templateA : id === 2 ? templateB : null,
    );

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, variables: ADMIN_INVITE_VARIABLES });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
    const subjects = vi.mocked(sendEmail).mock.calls.map((call) => call[0].subject);
    expect(subjects).toEqual(["A: alice", "B: alice"]);
  });

  it("excludes a disabled binding from the fan-out, sending only the enabled one", async () => {
    const enabledTemplate = makeTemplateRow({ id: 1, name: "Enabled template", subject: "Enabled: {{username}}" });
    const disabledTemplate = makeTemplateRow({ id: 2, name: "Disabled template", subject: "Disabled: {{username}}" });
    // Mixed set: the repository call is already scoped to enabled=true
    // bindings in production, but triggerEmailAction must not assume that and
    // should filter defensively — so this test hands back BOTH an enabled and
    // a disabled row, and asserts only the enabled one's template is ever
    // looked up or sent.
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
      { id: "bind-2", actionKey: ADMIN_INVITE_SENT, templateId: 2, enabled: false },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockImplementation(async (id) =>
      id === 1 ? enabledTemplate : id === 2 ? disabledTemplate : null,
    );

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, variables: ADMIN_INVITE_VARIABLES });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].subject).toBe("Enabled: alice");
    expect(vi.mocked(repo.getEmailTemplateById)).not.toHaveBeenCalledWith(2);
  });

  it("throws when a required action has zero enabled bindings", async () => {
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([]);

    await expect(
      triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, variables: ADMIN_INVITE_VARIABLES }),
    ).rejects.toThrow(/adminInviteSent/);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("throws when a bound template requires a variable the action did not supply", async () => {
    const template = makeTemplateRow({
      requiredVariables: [
        { name: "username", description: "Invited admin's username" },
        { name: "notSuppliedByAction", description: "A variable this action never provides" },
      ],
    });
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(template);

    await expect(
      triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, variables: ADMIN_INVITE_VARIABLES }),
    ).rejects.toThrow(/notSuppliedByAction/);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("throws for an unknown action key", async () => {
    await expect(triggerEmailAction("notARealAction", { to: RECIPIENT, variables: {} })).rejects.toThrow(
      /notARealAction/,
    );

    expect(vi.mocked(repo.listEmailActionBindings)).not.toHaveBeenCalled();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});
