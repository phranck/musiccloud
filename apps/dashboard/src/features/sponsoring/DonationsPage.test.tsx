import type { Donation, DonationInput, Sponsor } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchDonations: vi.fn(),
  createDonation: vi.fn(),
  updateDonation: vi.fn(),
  deleteDonation: vi.fn(),
  fetchSponsors: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchDonations: mocks.fetchDonations,
  createDonation: mocks.createDonation,
  updateDonation: mocks.updateDonation,
  deleteDonation: mocks.deleteDonation,
  fetchSponsors: mocks.fetchSponsors,
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { DonationsPage } from "./DonationsPage";

const sm = dashboardCopy.sponsoring;

/** One named PayPal donation of 20 euros. */
const STORED: Donation = {
  id: "d1",
  name: "Ada",
  published: true,
  amountCents: 2_000,
  receivedOn: "2026-11-02",
  provider: "paypal",
  note: "",
  externalRef: null,
  sponsorId: null,
  createdAt: "2026-11-02T10:00:00.000Z",
  updatedAt: "2026-11-02T10:00:00.000Z",
};

/** The one sponsor a donation can be linked to. */
const SPONSOR: Sponsor = {
  id: "s1",
  name: "Grace",
  socialMedia: [],
  avatarId: null,
  claim: "",
  published: true,
  paidOn: "2026-11-01",
  amountCents: 0,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DonationsPage />
    </QueryClientProvider>,
  );
}

describe("DonationsPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetchDonations.mockResolvedValue([STORED]);
    mocks.fetchSponsors.mockResolvedValue([SPONSOR]);
  });

  it("lists a donation with its day and its amount in euros", async () => {
    // Route and consent are secondary columns, which a zero-wide jsdom table hides.
    renderPage();

    expect(await screen.findByText("Ada")).not.toBeNull();
    expect(screen.getByText("2026-11-02")).not.toBeNull();
    expect(screen.getByText("€20")).not.toBeNull();
  });

  it("says where every figure comes from while the ledger is empty", async () => {
    mocks.fetchDonations.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(sm.donationsEmpty)).not.toBeNull();
    expect(screen.getByText(sm.donationsEmptyHint)).not.toBeNull();
  });

  it("records a donation in cents, with Save off until the amount is one", async () => {
    mocks.createDonation.mockImplementation(async (input: DonationInput) => ({ ...STORED, ...input, id: "d2" }));
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: sm.donationAdd }));
    const save = screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(sm.amountLabel), { target: { value: "12,50" } });
    fireEvent.change(screen.getByLabelText(sm.donorLabel), { target: { value: "  Grace " } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.createDonation).toHaveBeenCalled());
    expect(mocks.createDonation.mock.calls[0]?.[0]).toMatchObject({
      name: "Grace",
      amountCents: 1_250,
      provider: "bank-transfer",
      published: false,
      sponsorId: null,
    });
  });

  it("links a donation to the sponsor picked for it", async () => {
    mocks.updateDonation.mockImplementation(async (id: string, input: DonationInput) => ({ ...STORED, ...input, id }));
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.edit }));
    await waitFor(() => expect(mocks.fetchSponsors).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: sm.donationSponsorLabel }));
    fireEvent.click(await screen.findByRole("option", { name: "Grace · 2026-11-01" }));
    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.save }));

    await waitFor(() => expect(mocks.updateDonation).toHaveBeenCalled());
    expect(mocks.updateDonation.mock.calls[0]?.[1]).toMatchObject({ sponsorId: "s1" });
  });

  it("asks before removing a donation and names the one it removes", async () => {
    mocks.deleteDonation.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.remove }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2026-11-02 · Ada · €20")).not.toBeNull();
    expect(mocks.deleteDonation).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: dashboardCopy.common.remove }));
    await waitFor(() => expect(mocks.deleteDonation).toHaveBeenCalledWith("d1"));
  });
});
