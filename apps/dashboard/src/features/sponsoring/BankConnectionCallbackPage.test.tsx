import {
  BANK_CONNECTION_CALLBACK_DASHBOARD_PATH,
  BANK_CONNECTION_DASHBOARD_PATH,
  type BankConnectionStatus,
  BankErrorCode,
} from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ completeBankAuthorization: vi.fn() }));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  completeBankAuthorization: mocks.completeBankAuthorization,
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: () => null,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { BankConnectionCallbackPage } from "./BankConnectionCallbackPage";

const text = dashboardCopy.sponsoring.bankConnection;

/** A state of the shape the site issues. */
const STATE = "a".repeat(64);

/** The status the backend answers once the connection stands. */
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

/** Shows where the router stands, so a case can read the address after the page has acted. */
function CurrentAddress() {
  const location = useLocation();
  return <output data-testid="address">{`${location.pathname}${location.search}`}</output>;
}

/**
 * Renders the callback page at an address, as the bank returns to it, in
 * strict mode so the double effect of development runs too.
 *
 * @param search - The query the bank appended, such as `?code=…&state=…`.
 */
function renderAt(search: string) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`${BANK_CONNECTION_CALLBACK_DASHBOARD_PATH}${search}`]}>
          <Routes>
            <Route path={BANK_CONNECTION_CALLBACK_DASHBOARD_PATH} element={<BankConnectionCallbackPage />} />
            <Route path={BANK_CONNECTION_DASHBOARD_PATH} element={<p>bank connection page</p>} />
          </Routes>
          <CurrentAddress />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe("BankConnectionCallbackPage", () => {
  beforeEach(() => {
    mocks.completeBankAuthorization.mockReset();
  });

  it("hands the return to the backend once, clears it from the address, and goes on to the page", async () => {
    mocks.completeBankAuthorization.mockResolvedValue(CONNECTED);
    renderAt(`?code=code-1&state=${STATE}`);

    expect(await screen.findByText("bank connection page")).not.toBeNull();
    expect(mocks.completeBankAuthorization).toHaveBeenCalledTimes(1);
    expect(mocks.completeBankAuthorization.mock.calls[0]?.[0]).toEqual({ code: "code-1", state: STATE });
    expect(screen.getByTestId("address").textContent).toBe(BANK_CONNECTION_DASHBOARD_PATH);
  });

  it("says the connection is being made while the backend answers", async () => {
    mocks.completeBankAuthorization.mockReturnValue(new Promise(() => undefined));
    renderAt(`?code=code-1&state=${STATE}`);

    expect(await screen.findByText(text.callbackPending)).not.toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId("address").textContent).toBe(BANK_CONNECTION_CALLBACK_DASHBOARD_PATH),
    );
  });

  it("says the connection was not made, without asking the backend, when the return is incomplete", async () => {
    renderAt("?code=code-1");

    expect(await screen.findByText(text.callbackFailedTitle)).not.toBeNull();
    expect(screen.getByText(text.callbackFailedHint)).not.toBeNull();
    expect(mocks.completeBankAuthorization).not.toHaveBeenCalled();
  });

  it("says the connection was not made, with the code and the error id, when the backend refuses", async () => {
    mocks.completeBankAuthorization.mockRejectedValue(
      Object.assign(new Error("Refused."), { status: 400, errorCode: BankErrorCode.StateUnknown, errorId: "err-4" }),
    );
    renderAt(`?code=code-1&state=${STATE}`);

    expect(await screen.findByText(text.callbackFailedTitle)).not.toBeNull();
    expect((await screen.findByRole("alert")).textContent).toBe(
      `${text.callbackFailedHint} (${BankErrorCode.StateUnknown}) Error ID: err-4`,
    );
  });

  it("goes back to the bank connection page from the failure", async () => {
    renderAt("");

    fireEvent.click(await screen.findByRole("button", { name: text.callbackBack }));

    expect(await screen.findByText("bank connection page")).not.toBeNull();
  });
});
