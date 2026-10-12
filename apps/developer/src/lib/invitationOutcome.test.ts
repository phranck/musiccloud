import { PortalInvitationNext, PortalInvitationRefusal } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import { invitationDestination, invitationRefusalCopy } from "./invitationOutcome";

describe("invitationDestination", () => {
  it("opens the page each destination names", () => {
    expect(invitationDestination({ ok: true, status: 200, data: { next: PortalInvitationNext.Dashboard } })).toBe(
      "/dashboard",
    );
    expect(invitationDestination({ ok: true, status: 200, data: { next: PortalInvitationNext.SignUp } })).toBe(
      "/signup",
    );
    expect(invitationDestination({ ok: true, status: 200, data: { next: PortalInvitationNext.SignIn } })).toBe(
      "/login",
    );
  });

  it("opens nothing for a failure or a destination it does not know", () => {
    expect(
      invitationDestination({ ok: false, status: 410, data: { next: PortalInvitationNext.Dashboard } }),
    ).toBeNull();
    expect(invitationDestination({ ok: true, status: 200, data: { next: "toString" } })).toBeNull();
    expect(invitationDestination({ ok: true, status: 200 })).toBeNull();
  });
});

describe("invitationRefusalCopy", () => {
  it("says why a link no longer works, and offers sign-in where the person may hold an account", () => {
    const used = invitationRefusalCopy({ ok: false, status: 410, data: { reason: PortalInvitationRefusal.Used } });
    const expired = invitationRefusalCopy({
      ok: false,
      status: 410,
      data: { reason: PortalInvitationRefusal.Expired },
    });

    expect(used.title).toBe("Invitation already used");
    expect(used.offerSignIn).toBe(true);
    expect(expired.title).toBe("Invitation expired");
    expect(expired.offerSignIn).toBe(false);
  });

  it("falls back to a general failure for anything else", () => {
    expect(invitationRefusalCopy({ ok: false, status: 0 }).title).toBe("Invitation could not be opened");
    expect(invitationRefusalCopy({ ok: false, status: 429, data: { reason: "constructor" } }).title).toBe(
      "Invitation could not be opened",
    );
  });
});
