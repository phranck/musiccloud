/**
 * @file Holds {@link triggerEmailAction} to the one send path.
 *
 * `email-actions.test.ts` runs the trigger through the real renderer and
 * checks what is sent. This file replaces the send function and the renderer
 * with spies, so it can check that the trigger hands every bound template to
 * {@link sendTemplatedEmail} and renders nothing itself. A second render path
 * in the trigger is how the test send and a real mail came apart before.
 */

import { EmailBlockType, EmailRecipientKind } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRepository, EmailTemplateRow } from "../../db/admin-repository.js";
import { getAdminRepository } from "../../db/index.js";
import { triggerEmailAction } from "../email-actions.js";
import { renderEmailTemplate } from "../email-renderer.js";
import { sendTemplatedEmail } from "../email-sender.js";

vi.mock("../../db/index.js", () => ({ getAdminRepository: vi.fn() }));
vi.mock("../email-sender.js", () => ({ sendTemplatedEmail: vi.fn(async () => undefined) }));
vi.mock("../email-renderer.js", () => ({ renderEmailTemplate: vi.fn() }));

/** A template that uses one recipient and one context variable of the admin invite. */
function templateRow(id: number, subject: string): EmailTemplateRow {
  return {
    id,
    name: `Template ${id}`,
    subject,
    blocks: [{ type: EmailBlockType.Text, markdown: "Hi {{username}}, visit {{inviteUrl}}" }],
    isSystemTemplate: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    branding: {
      headerAssetId: null,
      footerText: null,
      lightBackgroundAssetId: null,
      darkBackgroundAssetId: null,
      lightGradientTop: null,
      lightGradientBottom: null,
      darkGradientTop: null,
      darkGradientBottom: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_URL", "https://musiccloud.example");
  vi.stubEnv("DASHBOARD_URL", "https://dashboard.musiccloud.example");
  vi.stubEnv("DEVELOPER_URL", "https://developer.musiccloud.example");
});

describe("triggerEmailAction send path", () => {
  it("hands each enabled binding's template to sendTemplatedEmail and renders nothing itself", async () => {
    const first = templateRow(1, "A: {{username}}");
    const second = templateRow(2, "B: {{username}}");
    vi.mocked(getAdminRepository).mockResolvedValue({
      listEmailActionBindings: vi.fn(async () => [
        { id: "bind-1", actionKey: "adminInviteSent", templateId: 1, enabled: true },
        { id: "bind-2", actionKey: "adminInviteSent", templateId: 2, enabled: true },
      ]),
      getEmailTemplateById: vi.fn(async (id: number) => (id === 1 ? first : second)),
    } as unknown as AdminRepository);

    await triggerEmailAction("adminInviteSent", {
      to: { email: "alice@example.com", name: "Alice" },
      recipient: { kind: EmailRecipientKind.AdminUser, username: "alice", email: "alice@example.com", role: "admin" },
      context: { inviteUrl: "https://dashboard.musiccloud.example/invite/abc" },
    });

    expect(vi.mocked(sendTemplatedEmail).mock.calls.map(([input]) => input.template)).toEqual([first, second]);
    expect(vi.mocked(sendTemplatedEmail).mock.calls[0]![0]).toMatchObject({
      to: { email: "alice@example.com", name: "Alice" },
      variables: {
        username: "alice",
        inviteUrl: "https://dashboard.musiccloud.example/invite/abc",
        loginUrl: "https://dashboard.musiccloud.example/login",
      },
    });
    expect(vi.mocked(renderEmailTemplate)).not.toHaveBeenCalled();
  });
});
