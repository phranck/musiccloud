import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readPortalAvailability: vi.fn(),
  readOpenPortalInvitationPass: vi.fn(),
}));

vi.mock("./developer-portal-availability.js", () => ({ readPortalAvailability: mocks.readPortalAvailability }));
vi.mock("./developer-portal-invitations.js", () => ({
  readOpenPortalInvitationPass: mocks.readOpenPortalInvitationPass,
}));

const { mayCreateDeveloperAccount, mayUseDeveloperApi } = await import("./developer-portal-access.js");

const closed = { public: false, maintenance: false };
const open = { public: true, maintenance: false };

describe("mayUseDeveloperApi", () => {
  beforeEach(() => {
    mocks.readPortalAvailability.mockReset();
  });

  it("admits an invited account without reading the portal's state", async () => {
    await expect(mayUseDeveloperApi({ portalAccessGrantedAt: 1_700_000_000_000 })).resolves.toBe(true);
    expect(mocks.readPortalAvailability).not.toHaveBeenCalled();
  });

  it("admits any other account only while the portal is public", async () => {
    mocks.readPortalAvailability.mockResolvedValueOnce(open);
    await expect(mayUseDeveloperApi({ portalAccessGrantedAt: null })).resolves.toBe(true);
    mocks.readPortalAvailability.mockResolvedValueOnce(closed);
    await expect(mayUseDeveloperApi({ portalAccessGrantedAt: null })).resolves.toBe(false);
  });
});

describe("mayCreateDeveloperAccount", () => {
  beforeEach(() => {
    mocks.readPortalAvailability.mockReset();
    mocks.readOpenPortalInvitationPass.mockReset();
  });

  it("opens accounts freely while the portal is public", async () => {
    mocks.readPortalAvailability.mockResolvedValue(open);

    await expect(mayCreateDeveloperAccount(null)).resolves.toBe(true);
    expect(mocks.readOpenPortalInvitationPass).not.toHaveBeenCalled();
  });

  it("opens one while the portal is closed only for a pass whose invitation still opens sign-up", async () => {
    mocks.readPortalAvailability.mockResolvedValue(closed);

    await expect(mayCreateDeveloperAccount(null)).resolves.toBe(false);
    expect(mocks.readOpenPortalInvitationPass).not.toHaveBeenCalled();

    mocks.readOpenPortalInvitationPass.mockResolvedValueOnce({ email: "new@example.com" });
    await expect(mayCreateDeveloperAccount("inv-1")).resolves.toBe(true);

    mocks.readOpenPortalInvitationPass.mockResolvedValueOnce(null);
    await expect(mayCreateDeveloperAccount("inv-1")).resolves.toBe(false);
  });
});
