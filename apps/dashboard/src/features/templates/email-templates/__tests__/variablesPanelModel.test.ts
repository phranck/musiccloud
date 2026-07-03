/**
 * @file Tests for the variables-panel derivation logic (MC-081): which
 * catalog variables the editor offers for a template, driven by the actions
 * the template is currently bound to, and how detected `{{var}}` names split
 * into known vs. unknown (typo) sets.
 */

import { EmailBlockType, EmailRecipientKind } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import {
  buildVariablesPanelModel,
  splitDetectedVariables,
} from "@/features/templates/email-templates/variablesPanelModel";

describe("buildVariablesPanelModel", () => {
  it("defaults to the admin-user recipient set when the template is bound to no action", () => {
    const model = buildVariablesPanelModel([]);

    expect(model.system.map((v) => v.name)).toEqual(["websiteUrl", "dashboardUrl", "developerUrl", "loginUrl"]);
    expect(model.recipient.map((v) => v.name)).toEqual(["username", "email", "role"]);
    expect(model.context).toEqual([]);
    expect(model.availableNames).toContain("websiteUrl");
    expect(model.availableNames).toContain("role");
  });

  it("scopes the recipient group to the bound action's kind and lists its context variables", () => {
    const model = buildVariablesPanelModel([
      { recipientKind: EmailRecipientKind.DeveloperAccount, contextVariables: ["verifyUrl"] },
    ]);

    expect(model.recipient.map((v) => v.name)).toEqual(["username", "email"]);
    expect(model.context.map((v) => v.name)).toEqual(["verifyUrl"]);
    expect(model.availableNames).not.toContain("role");
    expect(model.availableNames).toContain("verifyUrl");
  });

  it("unions recipient kinds and context variables across several bound actions", () => {
    const model = buildVariablesPanelModel([
      { recipientKind: EmailRecipientKind.AdminUser, contextVariables: ["inviteUrl"] },
      { recipientKind: EmailRecipientKind.DeveloperAccount, contextVariables: ["verifyUrl"] },
    ]);

    expect(model.recipient.map((v) => v.name)).toEqual(["username", "email", "role"]);
    expect(model.context.map((v) => v.name)).toEqual(["inviteUrl", "verifyUrl"]);
  });

  it("deduplicates context variables shared by several bound actions", () => {
    const model = buildVariablesPanelModel([
      { recipientKind: EmailRecipientKind.AdminUser, contextVariables: ["inviteUrl"] },
      { recipientKind: EmailRecipientKind.AdminUser, contextVariables: ["inviteUrl"] },
    ]);

    expect(model.context.map((v) => v.name)).toEqual(["inviteUrl"]);
  });
});

describe("splitDetectedVariables", () => {
  it("splits detected placeholders into known and unknown by the available set", () => {
    const model = buildVariablesPanelModel([]);
    const split = splitDetectedVariables(
      "Hi {{username}}",
      [{ type: EmailBlockType.Text, markdown: "See {{websiteUrl}} and {{typoVar}}" }],
      model.availableNames,
    );

    expect(split.known).toEqual(["username", "websiteUrl"]);
    expect(split.unknown).toEqual(["typoVar"]);
  });

  it("returns empty arrays for a template without placeholders", () => {
    const model = buildVariablesPanelModel([]);
    const split = splitDetectedVariables("Static", [], model.availableNames);

    expect(split.known).toEqual([]);
    expect(split.unknown).toEqual([]);
  });
});
