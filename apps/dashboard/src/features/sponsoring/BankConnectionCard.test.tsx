import { BANK_CONNECTION_DASHBOARD_PATH, type BankConnectionStatus, BankErrorCode } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchBankConnection: vi.fn(),
  fetchSponsoringConfig: vi.fn(),
  syncBank: vi.fn(),
  role: "owner",
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchBankConnection: mocks.fetchBankConnection,
  fetchSponsoringConfig: mocks.fetchSponsoringConfig,
  syncBank: mocks.syncBank,
}));

vi.mock("@/features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: mocks.role } }),
}));

import { dashboardCopy } from "@/copy/dashboard";
import { BankConnectionCard } from "./BankConnectionCard";

const text = dashboardCopy.sponsoring.bankConnection;

/** The moment the card measures against: 2026-09-03, noon. */
const NOW = new Date("2026-09-03T12:00:00.000Z");

/** A connection in force that has been read once, with a read to come. */
const READ: BankConnectionStatus = {
  configured: true,
  connected: true,
  institutionName: "Erste Bank",
  institutionCountry: "AT",
  consentValidUntil: "2027-03-02T12:00:00.000Z",
  connectedAt: "2026-08-03T10:00:00.000Z",
  // An hour either side of noon UTC, so both stay on September 3 in every zone
  // from UTC-11 to UTC+10.
  lastReadAt: "2026-09-03T11:00:00.000Z",
  lastReadSucceeded: true,
  lastReadImported: 2,
  lastReadFilled: 1,
  lastReadFailure: null,
  nextReadAt: "2026-09-03T13:00:00.000Z",
};

/** What the page under the card stands for in these cases. */
const BANK_PAGE_MARK = "the bank connection page";

/** Renders the card with a fresh query client, beside the route Renew leads to. */
function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/sponsoring/donations"]}>
        <Routes>
          <Route path="/sponsoring/donations" element={<BankConnectionCard />} />
          <Route path={BANK_CONNECTION_DASHBOARD_PATH} element={<p>{BANK_PAGE_MARK}</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Matches a moment on 2026-09-03 written with its minute, followed by what
 * else the line says. The card writes the moment in the browser's own time
 * zone, so the hour is whatever that zone makes of it.
 *
 * @param rest - What follows the moment, such as ` · 2 taken in`, or nothing.
 */
function onSeptemberThird(rest = ""): RegExp {
  const escaped = rest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^Sep 3, 2026, \\d{1,2}:00\\s[AP]M${escaped}$`);
}

/** Opens the card's body through its own toggle. */
async function openCard() {
  fireEvent.click(await screen.findByRole("button", { name: text.cardTitle }));
}

describe("BankConnectionCard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    mocks.fetchBankConnection.mockReset().mockResolvedValue(READ);
    mocks.fetchSponsoringConfig.mockReset().mockResolvedValue({ payeeIban: "AT611904300234573201" });
    mocks.syncBank.mockReset().mockResolvedValue({ ran: true, from: "2026-08-29", to: "2026-09-03" });
    mocks.role = "owner";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says when the account was last read, what that read did, and when it is read next", async () => {
    renderCard();

    expect(
      await screen.findByText(onSeptemberThird(` · 2 ${text.lastReadImported}, 1 ${text.lastReadFilled}`)),
    ).not.toBeNull();
    // The next read, two hours after the last one, with nothing after it.
    expect(screen.getAllByText(onSeptemberThird())).toHaveLength(1);
    expect(screen.getByText(text.states.connected)).not.toBeNull();
  });

  it("names completions only where a read made any", async () => {
    mocks.fetchBankConnection.mockResolvedValue({ ...READ, lastReadFilled: 0 });
    renderCard();

    expect(await screen.findByText(onSeptemberThird(` · 2 ${text.lastReadImported}`))).not.toBeNull();
  });

  it("says the account was never read, and that the next read is due, before the first read", async () => {
    mocks.fetchBankConnection.mockResolvedValue({
      ...READ,
      lastReadAt: null,
      lastReadSucceeded: null,
      nextReadAt: NOW.toISOString(),
    });
    renderCard();

    expect(await screen.findByText(text.lastReadNever)).not.toBeNull();
    expect(screen.getByText(text.nextReadDue)).not.toBeNull();
  });

  it("names the bank, the account as its owner knows it, and how long the consent lasts", async () => {
    renderCard();
    await openCard();

    expect(screen.getByText("Erste Bank (AT)")).not.toBeNull();
    expect(await screen.findByText("AT61 1904 3002 3457 3201")).not.toBeNull();
    expect(screen.getByText("March 2, 2027")).not.toBeNull();
  });

  it.each([
    [BankErrorCode.RequestRefused, text.readFailures.requestRefused],
    [BankErrorCode.Unreachable, text.readFailures.unreachable],
    [BankErrorCode.ReadFailed, text.readFailures.unknown],
    ["MC-BANK-9999", text.readFailures.unknown],
  ])("says why the last read failed with %s, in the card's own words", async (code, sentence) => {
    mocks.fetchBankConnection.mockResolvedValue({ ...READ, lastReadSucceeded: false, lastReadFailure: code });
    renderCard();
    await openCard();

    expect(await screen.findByText(sentence)).not.toBeNull();
    expect(screen.getByText(onSeptemberThird(` · ${text.lastReadFailed}`))).not.toBeNull();
  });

  it("shows nothing while the deployment holds no credential", async () => {
    mocks.fetchBankConnection.mockResolvedValue({ ...READ, configured: false });
    renderCard();

    await waitFor(() => expect(mocks.fetchBankConnection).toHaveBeenCalled());
    expect(screen.queryByText(text.cardTitle)).toBeNull();
  });

  it("reads the days the read takes by itself when no day is chosen", async () => {
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: text.syncNow }));

    await waitFor(() => expect(mocks.syncBank).toHaveBeenCalledWith({}, expect.anything()));
  });

  it("reads from the day the owner chose", async () => {
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: text.syncFromLabel }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /September 1st, 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: text.syncNow }));

    await waitFor(() => expect(mocks.syncBank).toHaveBeenCalledWith({ from: "2026-09-01" }, expect.anything()));
  });

  it("offers no read while nothing is connected, and Connect instead of Renew", async () => {
    mocks.fetchBankConnection.mockResolvedValue({ ...READ, connected: false, institutionName: "" });
    renderCard();

    expect(((await screen.findByRole("button", { name: text.syncNow })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: text.connect })).not.toBeNull();
  });

  it("leads to the bank connection page to renew the connection", async () => {
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: text.renew }));

    expect(await screen.findByText(BANK_PAGE_MARK)).not.toBeNull();
  });

  it("says a refused read did not work, with the code and the error id", async () => {
    mocks.syncBank.mockRejectedValue(
      Object.assign(new Error("Refused. (MC-AUTH-0002)"), { status: 403, errorCode: "MC-AUTH-0002", errorId: "err-1" }),
    );
    renderCard();
    await openCard();

    fireEvent.click(screen.getByRole("button", { name: text.syncNow }));

    expect((await screen.findByRole("alert")).textContent).toBe(`${text.syncFailed} (MC-AUTH-0002) Error ID: err-1`);
  });

  it("shows an admin the state and no action, because both reach the bank account", async () => {
    mocks.role = "admin";
    renderCard();

    expect(await screen.findByText(text.states.connected)).not.toBeNull();
    expect(screen.queryByRole("button", { name: text.syncNow })).toBeNull();
    expect(screen.queryByRole("button", { name: text.renew })).toBeNull();
  });

  it("remembers in this browser that it was opened", async () => {
    renderCard();
    await openCard();

    expect(localStorage.getItem("bank-connection-card-open")).toBe("true");
  });
});
