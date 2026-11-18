import { type BankConnectionStatus, BankErrorCode } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBankConnection: vi.fn(),
  startBankAuthorization: vi.fn(),
  disconnectBank: vi.fn(),
  leaveDashboardFor: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchBankConnection: mocks.fetchBankConnection,
  startBankAuthorization: mocks.startBankAuthorization,
  disconnectBank: mocks.disconnectBank,
}));

vi.mock("./browserNavigation", () => ({ leaveDashboardFor: mocks.leaveDashboardFor }));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { BankConnectionPage } from "./BankConnectionPage";

const text = dashboardCopy.sponsoring.bankConnection;

/** The moment the page measures the consent against. */
const NOW = new Date("2026-09-03T12:00:00.000Z");
/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** A connection in force whose consent is far off. */
const CONNECTED: BankConnectionStatus = {
  configured: true,
  connected: true,
  institutionName: "Erste Bank",
  institutionCountry: "AT",
  consentValidUntil: "2027-03-02T12:00:00.000Z",
  connectedAt: "2026-09-03T10:00:00.000Z",
  lastReadAt: null,
  lastReadSucceeded: null,
  lastReadImported: 0,
  lastReadFilled: 0,
  lastReadFailure: null,
  nextReadAt: null,
};

/** A configured site with nothing connected. */
const DISCONNECTED: BankConnectionStatus = {
  ...CONNECTED,
  connected: false,
  institutionName: "",
  institutionCountry: "",
  consentValidUntil: null,
  connectedAt: null,
};

/**
 * A request failure as the dashboard's api client throws it.
 *
 * @param code - The backend's error code.
 * @param errorId - The id the backend logged it under.
 */
function refusal(code: string, errorId: string) {
  return Object.assign(new Error(`Refused. (${code})`), { status: 502, errorCode: code, errorId });
}

/** Renders the page with a fresh query client. */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <BankConnectionPage />
    </QueryClientProvider>,
  );
}

describe("BankConnectionPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetchBankConnection.mockResolvedValue(CONNECTED);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the bank, the day it was connected and how long the consent lasts", async () => {
    renderPage();

    expect(await screen.findByText("Erste Bank (AT)")).not.toBeNull();
    expect(screen.getByText(text.stateTitle)).not.toBeNull();
    expect(screen.getByText(text.stateHint)).not.toBeNull();
    expect(screen.getByText("September 3, 2026")).not.toBeNull();
    expect(screen.getByText("March 2, 2027")).not.toBeNull();
    expect(screen.getByText(text.states.connected)).not.toBeNull();
    expect(screen.getByRole("button", { name: text.renew })).not.toBeNull();
    expect(screen.getByRole("button", { name: text.disconnect })).not.toBeNull();
  });

  it("offers to connect, and shows no values, while nothing is connected", async () => {
    mocks.fetchBankConnection.mockResolvedValue(DISCONNECTED);
    renderPage();

    expect(await screen.findByText(text.states.disconnected)).not.toBeNull();
    expect(screen.getAllByText(text.valueAbsent)).toHaveLength(3);
    expect(screen.getByRole("button", { name: text.connect })).not.toBeNull();
    expect(screen.queryByRole("button", { name: text.disconnect })).toBeNull();
  });

  it("says the consent expires soon inside the warning window", async () => {
    mocks.fetchBankConnection.mockResolvedValue({
      ...CONNECTED,
      consentValidUntil: new Date(NOW.getTime() + 2 * DAY_MS).toISOString(),
    });
    renderPage();

    expect(await screen.findByText(text.states.expiring)).not.toBeNull();
  });

  it("says the consent has expired once it lies behind", async () => {
    mocks.fetchBankConnection.mockResolvedValue({
      ...CONNECTED,
      consentValidUntil: new Date(NOW.getTime() - DAY_MS).toISOString(),
    });
    renderPage();

    expect(await screen.findByText(text.states.expired)).not.toBeNull();
  });

  it("says no credential is held, and offers nothing to press, while the site is unconfigured", async () => {
    mocks.fetchBankConnection.mockResolvedValue({ ...DISCONNECTED, configured: false });
    renderPage();

    expect(await screen.findByText(text.unconfiguredTitle)).not.toBeNull();
    expect(screen.getByText(text.unconfiguredHint)).not.toBeNull();
    expect(screen.queryByRole("button", { name: text.connect })).toBeNull();
    expect(screen.queryByText(text.stateTitle)).toBeNull();
  });

  it("hands the browser over to the bank's address once the authorization has started", async () => {
    mocks.fetchBankConnection.mockResolvedValue(DISCONNECTED);
    mocks.startBankAuthorization.mockResolvedValue({ url: "https://bank.example/authorize" });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: text.connect }));

    await waitFor(() => expect(mocks.leaveDashboardFor).toHaveBeenCalledWith("https://bank.example/authorize"));
  });

  it("says the bank could not be reached, with the code and the error id, when starting fails", async () => {
    mocks.fetchBankConnection.mockResolvedValue(DISCONNECTED);
    mocks.startBankAuthorization.mockRejectedValue(refusal(BankErrorCode.Unreachable, "err-1"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: text.connect }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      `${text.startFailed} (${BankErrorCode.Unreachable}) Error ID: err-1`,
    );
    expect(mocks.leaveDashboardFor).not.toHaveBeenCalled();
  });

  it("asks before disconnecting, and lets the account go once confirmed", async () => {
    mocks.disconnectBank.mockResolvedValue(DISCONNECTED);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: text.disconnect }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(text.disconnectTitle)).not.toBeNull();
    expect(within(dialog).getByText(text.disconnectConfirm)).not.toBeNull();
    expect(mocks.disconnectBank).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: text.disconnect }));

    await waitFor(() => expect(mocks.disconnectBank).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says the connection is gone but the consent stands when the bank would not close it", async () => {
    mocks.disconnectBank.mockRejectedValue(refusal(BankErrorCode.CloseFailed, "err-2"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: text.disconnect }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: text.disconnect }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      `${text.disconnectPartial} (${BankErrorCode.CloseFailed}) Error ID: err-2`,
    );
  });

  it("says disconnecting did not work when it was refused for any other reason", async () => {
    mocks.disconnectBank.mockRejectedValue(refusal(BankErrorCode.Unreachable, "err-3"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: text.disconnect }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: text.disconnect }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      `${text.disconnectFailed} (${BankErrorCode.Unreachable}) Error ID: err-3`,
    );
  });
});
