import { type PortalInvitation, PortalInvitationState } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderElementsAtWidth } from "@/test-layout";

const mocks = vi.hoisted(() => ({
  fetchPortalInvitations: vi.fn(),
  invitePortalDeveloper: vi.fn(),
  resendPortalInvitation: vi.fn(),
  withdrawPortalInvitation: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchPortalInvitations: mocks.fetchPortalInvitations,
  invitePortalDeveloper: mocks.invitePortalDeveloper,
  resendPortalInvitation: mocks.resendPortalInvitation,
  withdrawPortalInvitation: mocks.withdrawPortalInvitation,
}));

import { PortalInvitationsSection } from "./PortalInvitationsSection";

function invitation(overrides: Partial<PortalInvitation>): PortalInvitation {
  return {
    id: "inv-1",
    email: "open@example.com",
    state: PortalInvitationState.Open,
    createdAt: "2026-10-12T10:00:00.000Z",
    sentAt: "2026-10-12T10:00:00.000Z",
    expiresAt: "2026-10-26T10:00:00.000Z",
    usedAt: null,
    withdrawnAt: null,
    account: null,
    sentBy: "olive",
    ...overrides,
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalInvitationsSection />
    </QueryClientProvider>,
  );
}

/** The row whose address cell reads `email`. */
async function rowOf(email: string): Promise<HTMLElement> {
  const cell = await screen.findByText(email);
  return cell.closest("tr") as HTMLElement;
}

describe("PortalInvitationsSection", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    renderElementsAtWidth(1400);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists each invitation with its state, its account and who sent it, and offers only what applies", async () => {
    mocks.fetchPortalInvitations.mockResolvedValue({
      invitations: [
        invitation({ id: "a", email: "open@example.com" }),
        invitation({
          id: "b",
          email: "used@example.com",
          state: PortalInvitationState.Used,
          account: { id: "acc-1", email: "account@example.com" },
        }),
        invitation({ id: "c", email: "gone@example.com", state: PortalInvitationState.Withdrawn }),
      ],
    });
    renderSection();

    const open = await rowOf("open@example.com");
    expect(within(open).getByText("Open")).not.toBeNull();
    expect(within(open).getByText("None yet")).not.toBeNull();
    expect(within(open).getByText("by olive")).not.toBeNull();
    expect(within(open).getByRole("button", { name: /Send again/ })).not.toBeNull();
    expect(within(open).getByRole("button", { name: /Withdraw/ })).not.toBeNull();

    const used = await rowOf("used@example.com");
    expect(within(used).getByText("account@example.com")).not.toBeNull();
    expect(within(used).queryByRole("button", { name: /Send again/ })).toBeNull();
    expect(within(used).getByRole("button", { name: /Withdraw/ })).not.toBeNull();

    const withdrawn = await rowOf("gone@example.com");
    expect(within(withdrawn).queryByRole("button")).toBeNull();
  });

  it("invites the address as typed and says where it went", async () => {
    mocks.fetchPortalInvitations.mockResolvedValue({ invitations: [] });
    mocks.invitePortalDeveloper.mockResolvedValue({ invitation: invitation({ email: "new@example.com" }) });
    renderSection();

    await userEvent.type(await screen.findByLabelText("Email address"), "  new@example.com ");
    await userEvent.click(screen.getByRole("button", { name: /Invite/ }));

    expect(mocks.invitePortalDeveloper).toHaveBeenCalledWith("new@example.com", expect.anything());
    expect(await screen.findByText("Invitation sent to new@example.com.")).not.toBeNull();
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("");
  });

  it("names the server's reason and its error id when the invitation could not be sent", async () => {
    mocks.fetchPortalInvitations.mockResolvedValue({ invitations: [] });
    mocks.invitePortalDeveloper.mockRejectedValue(
      Object.assign(new Error("The invitation could not be sent, so nothing was stored. (MC-SYS-0003)"), {
        status: 503,
        errorId: "err-9",
      }),
    );
    renderSection();

    await userEvent.type(await screen.findByLabelText("Email address"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Invite/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The invitation could not be sent, so nothing was stored. (MC-SYS-0003) Error ID: err-9",
    );
  });

  it("withdraws only after the second press", async () => {
    mocks.fetchPortalInvitations.mockResolvedValue({ invitations: [invitation({ id: "a" })] });
    mocks.withdrawPortalInvitation.mockResolvedValue({
      invitation: invitation({ id: "a", state: PortalInvitationState.Withdrawn }),
    });
    renderSection();

    await userEvent.click(within(await rowOf("open@example.com")).getByRole("button", { name: /Withdraw/ }));
    expect(mocks.withdrawPortalInvitation).not.toHaveBeenCalled();
    const question = screen.getByText(/Withdraw the invitation for open@example.com\?/);

    await userEvent.click(within(question.parentElement as HTMLElement).getByRole("button", { name: /Withdraw/ }));
    expect(mocks.withdrawPortalInvitation).toHaveBeenCalledWith("a", expect.anything());
  });
});
