/**
 * @file Service tests for {@link triggerEmailAction} (MC-078, Scopes MC-081).
 * Drives the real fan-out/validation logic against a fully-stubbed
 * {@link AdminRepository} and a mocked {@link sendEmail}, so no Postgres pool
 * or SMTP2GO call is ever made.
 *
 * ## What is real vs. mocked
 *
 * - **Real:** `triggerEmailAction`'s own logic (action lookup, binding
 *   fan-out, `enabled` filtering, recipient-kind check, variable resolution
 *   via the real resolver, send-time gate, rendering via the real
 *   {@link renderEmailTemplate}).
 * - **Mocked:** the persistence layer (`getAdminRepository` from
 *   `../db/index.js`) and the transport (`sendEmail` from
 *   `./email-provider.js`), mirroring the mocking conventions already
 *   established for route/service tests in this codebase (see
 *   `../../routes/developer-auth.test.ts`: one `vi.mock` per dependency
 *   module, a `makeRepo()` factory returning `vi.fn()` stubs, and
 *   `vi.mocked(...).mockResolvedValue(...)` wiring in `beforeEach`).
 */

import { EmailBlockType, EmailRecipientKind } from "@musiccloud/shared";
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

/** `email_action_bindings` action key used by most cases (`required: true` in the EMAIL_ACTIONS registry). */
const ADMIN_INVITE_SENT = "adminInviteSent";

/** The admin-user addressee: recipient-scope variables resolve from this object. */
const ADMIN_RECIPIENT = {
  kind: EmailRecipientKind.AdminUser,
  username: "alice",
  email: "alice@example.com",
  role: "admin",
} as const;

/** Context extras `adminInviteSent` supplies per the shared registry. */
const INVITE_CONTEXT = {
  inviteUrl: "https://dashboard.musiccloud.example/invite/abc",
};

const RECIPIENT = { email: "alice@example.com", name: "Alice" };

const BRANDING: EmailBrandingDto = {
  headerAssetId: null,
  footerAssetId: null,
  footerText: null,
  lightBackgroundAssetId: null,
  darkBackgroundAssetId: null,
  lightGradientTop: "#0076d5",
  lightGradientBottom: "#69d1fd",
  darkGradientTop: "#0b1318",
  darkGradientBottom: "#10273b",
};

/**
 * Builds a fully-populated {@link EmailTemplateRow}, defaulting to a single
 * text block whose body references only variables available to
 * `adminInviteSent` (recipient + context scopes) — so the template's
 * auto-extracted required set (MC-080) is always satisfiable on the happy
 * path. Most tests use this shape unmodified.
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
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    branding: {
      headerAssetId: null,
      footerAssetId: null,
      footerText: null,
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: null,
      lightGradientBottom: null,
      darkGradientTop: null,
      darkGradientBottom: null,
    },
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
  vi.stubEnv("PUBLIC_URL", "https://musiccloud.example");
  vi.stubEnv("DASHBOARD_URL", "https://dashboard.musiccloud.example");
  vi.stubEnv("DEVELOPER_URL", "https://developer.musiccloud.example");
  repo = makeRepo();
  vi.mocked(getAdminRepository).mockResolvedValue(repo);
});

describe("triggerEmailAction", () => {
  it("renders and sends the one enabled binding, resolving recipient and context variables", async () => {
    const template = makeTemplateRow();
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(template);

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.to).toEqual(RECIPIENT);
    expect(sent.subject).toBe("Welcome alice");
    expect(sent.html).toContain("Hi alice");
    expect(sent.html).toContain("https://dashboard.musiccloud.example/invite/abc");
  });

  it("resolves system variables from the environment without the caller supplying them", async () => {
    const template = makeTemplateRow({
      subject: "Login at {{loginUrl}}",
      blocks: [{ type: EmailBlockType.Text, markdown: "Site: {{websiteUrl}}" }],
    });
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(template);

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT });

    const sent = vi.mocked(sendEmail).mock.calls[0]![0];
    expect(sent.subject).toBe("Login at https://dashboard.musiccloud.example/login");
    // The markdown renderer auto-links bare URLs, so assert on the resolved
    // URL itself rather than the contiguous "Site: <url>" text.
    expect(sent.html).toContain("https://musiccloud.example");
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

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT });

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

    await triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0]![0].subject).toBe("Enabled: alice");
    expect(vi.mocked(repo.getEmailTemplateById)).not.toHaveBeenCalledWith(2);
  });

  it("silently skips an optional (required: false) action with zero enabled bindings", async () => {
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([]);

    await expect(
      triggerEmailAction("developerAccountDeleted", {
        to: { email: "dev@example.com" },
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev" },
        context: {},
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(repo.getEmailBranding)).not.toHaveBeenCalled();
  });

  it("throws when a required action has zero enabled bindings", async () => {
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([]);

    await expect(
      triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT }),
    ).rejects.toThrow(/adminInviteSent/);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("throws when a bound template uses a variable that is neither resolvable nor supplied", async () => {
    // The required set is auto-extracted from the body (MC-080): this template
    // references `{{notSuppliedByAction}}`, which neither the resolver (system
    // + recipient scopes) nor the invite context provides, so the send-time
    // gate must reject it before sending.
    const template = makeTemplateRow({
      blocks: [{ type: EmailBlockType.Text, markdown: "Hi {{username}}, ref {{notSuppliedByAction}}" }],
    });
    vi.mocked(repo.listEmailActionBindings).mockResolvedValueOnce([
      { id: "bind-1", actionKey: ADMIN_INVITE_SENT, templateId: 1, enabled: true },
    ]);
    vi.mocked(repo.getEmailTemplateById).mockResolvedValueOnce(template);

    await expect(
      triggerEmailAction(ADMIN_INVITE_SENT, { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: INVITE_CONTEXT }),
    ).rejects.toThrow(/notSuppliedByAction/);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("throws when the recipient kind does not match the action's declared kind", async () => {
    await expect(
      triggerEmailAction(ADMIN_INVITE_SENT, {
        to: RECIPIENT,
        recipient: { kind: EmailRecipientKind.DeveloperAccount, email: "dev@example.com", displayName: "Dev" },
        context: INVITE_CONTEXT,
      }),
    ).rejects.toThrow(/recipient kind/i);

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("throws for an unknown action key", async () => {
    await expect(
      triggerEmailAction("notARealAction", { to: RECIPIENT, recipient: ADMIN_RECIPIENT, context: {} }),
    ).rejects.toThrow(/notARealAction/);

    expect(vi.mocked(repo.listEmailActionBindings)).not.toHaveBeenCalled();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});
