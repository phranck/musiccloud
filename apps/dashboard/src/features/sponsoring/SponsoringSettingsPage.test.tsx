import { SPONSORING_DEFAULTS, type SponsoringConfig } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  updateConfig: vi.fn(),
  role: "owner",
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchSponsoringConfig: mocks.fetchConfig,
  updateSponsoringConfig: mocks.updateConfig,
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: mocks.role } }),
}));

// The real header hands its actions to the layout's slot, which this test does
// not mount, so the stand-in renders them in a marked element of its own.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div data-testid="page-header">{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { SponsoringSettingsPage } from "./SponsoringSettingsPage";

const sm = dashboardCopy.sponsoring;

/** 230 euros a year and a valid account. */
const STORED: SponsoringConfig = {
  ...SPONSORING_DEFAULTS,
  costs: [
    { label: "Hosting", amountCents: 20_000 },
    { label: "Domain", amountCents: 3_000 },
  ],
  payeeName: "Frank Gregor",
  payeeIban: "AT611904300234573201",
  payeeBic: "BKAUATWW",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SponsoringSettingsPage />
    </QueryClientProvider>,
  );
}

describe("SponsoringSettingsPage", () => {
  beforeEach(() => {
    mocks.fetchConfig.mockReset();
    mocks.updateConfig.mockReset();
    mocks.fetchConfig.mockResolvedValue(STORED);
    mocks.role = "owner";
  });

  it("arranges lmaa.space's four cards, with the yearly sum in the costs header", async () => {
    const { container } = renderPage();
    await screen.findByLabelText(sm.payeeIbanLabel);

    const titles = [...container.querySelectorAll(".font-serif")].map((title) => title.textContent);
    expect(titles).toEqual([sm.costsTitle, sm.sponsorMinimumTitle, sm.payeeTitle, sm.purposesTitle]);
    expect(screen.getByText(sm.costsHint)).not.toBeNull();
    expect(screen.getByText("€230")).not.toBeNull();
    expect(screen.getByText(sm.payeeDescription)).not.toBeNull();
    expect(screen.getByText(sm.purposesDescription)).not.toBeNull();
  });

  it("names every site variable where lmaa.space names it, each with a copy button", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage();
    await screen.findByLabelText(sm.payeeIbanLabel);

    const shown = [...document.querySelectorAll("code")].map((code) => code.textContent);
    expect(shown).toEqual([
      "{annualCost}",
      "{monthlyCost}",
      "{payeeName}",
      "{payeeIban}",
      "{payeeBic}",
      "{purposeDonation}",
      "{purposeSponsor}",
      "{purposePaypal}",
    ]);
    expect(screen.getAllByRole("button", { name: dashboardCopy.common.copy })).toHaveLength(shown.length);

    fireEvent.click(screen.getAllByRole("button", { name: dashboardCopy.common.copy })[2] as HTMLElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("{payeeName}"));
  });

  it("puts Save in the page header and in no card", async () => {
    renderPage();
    await screen.findByLabelText(sm.payeeIbanLabel);

    const save = screen.getByRole("button", { name: dashboardCopy.common.save });
    expect(screen.getByTestId("page-header").contains(save)).toBe(true);
  });

  it("keeps Save off until something changed, and off while the IBAN is wrong", async () => {
    renderPage();
    const iban = (await screen.findByLabelText(sm.payeeIbanLabel)) as HTMLInputElement;
    const save = screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(iban, { target: { value: "AT611904300234573202" } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText(sm.ibanInvalid)).not.toBeNull();

    fireEvent.change(iban, { target: { value: "at61 1904 3002 3457 3201" } });
    expect(save.disabled).toBe(false);
  });

  it("sends the account without spaces and the amounts in cents", async () => {
    mocks.updateConfig.mockImplementation(async (next: SponsoringConfig) => next);
    renderPage();
    const iban = await screen.findByLabelText(sm.payeeIbanLabel);

    fireEvent.change(iban, { target: { value: "at61 1904 3002 3457 3201" } });
    fireEvent.change(screen.getByLabelText(`${sm.costAmount} 2`), { target: { value: "12,50" } });
    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.save }));

    await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalled());
    const sent = mocks.updateConfig.mock.calls[0]?.[0] as SponsoringConfig;
    expect(sent.payeeIban).toBe("AT611904300234573201");
    expect(sent.costs).toEqual([
      { label: "Hosting", amountCents: 20_000 },
      { label: "Domain", amountCents: 1_250 },
    ]);
  });

  it("lets an admin read but not change the setting, and says why", async () => {
    mocks.role = "admin";
    renderPage();

    const iban = (await screen.findByLabelText(sm.payeeIbanLabel)) as HTMLInputElement;
    expect(screen.getByText(sm.ownerOnly)).not.toBeNull();
    expect(iban.closest("fieldset")?.disabled).toBe(true);
    fireEvent.change(iban, { target: { value: "at61 1904 3002 3457 3201" } });
    expect((screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement).disabled).toBe(true);
  });
});
