import {
  PENDING_SPONSORSHIP_DAYS,
  type PendingSponsorship,
  SPONSORING_DEFAULTS,
  type Sponsor,
} from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderElementsAtWidth } from "@/test-layout";

const mocks = vi.hoisted(() => ({
  fetchSponsoringConfig: vi.fn(),
  fetchSponsorshipRequests: vi.fn(),
  takeOverSponsorshipRequest: vi.fn(),
  deleteSponsorshipRequest: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchSponsoringConfig: mocks.fetchSponsoringConfig,
  fetchSponsorshipRequests: mocks.fetchSponsorshipRequests,
  takeOverSponsorshipRequest: mocks.takeOverSponsorshipRequest,
  deleteSponsorshipRequest: mocks.deleteSponsorshipRequest,
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { LEDGER_QUERY_KEY, SPONSORSHIP_REQUESTS_QUERY_KEY } from "./api";
import { SponsorshipRequestsPage } from "./SponsorshipRequestsPage";

const sm = dashboardCopy.sponsoring;

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The sponsoring minimum the mocked settings hold, 75 euros, which differs from `SPONSORING_DEFAULTS`. */
const STORED_MINIMUM_CENTS = 7_500;

/** A width at which the table shows its secondary columns too. */
const WIDE_TABLE_PX = 1400;

/** The moment the page counts from: 2026-11-17, local noon so no time zone moves the day. */
const NOW = new Date(2026, 10, 17, 12);

/** The reference of {@link OPEN}, as it travels and as it is printed. */
const REFERENCE = "RF12MCSP7Q2K9X4M8T3B";
const REFERENCE_PRINTED = "RF12 MCSP 7Q2K 9X4M 8T3B";

/** A request made ten days before {@link NOW} that announced 60 euros, so 50 days are left. */
const OPEN: PendingSponsorship = {
  id: "r1",
  reference: REFERENCE,
  name: "Ada",
  socialMedia: [{ platform: "mastodon", url: "https://chaos.social/@ada" }],
  claim: "Music for everybody.",
  amountCents: 6_000,
  published: true,
  createdAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
};

/** A request whose time ran out before {@link NOW}, which announced nothing and keeps its name off the site. */
const EXPIRED: PendingSponsorship = {
  ...OPEN,
  id: "r2",
  reference: "RF34MCSPABCDEFGHJKMN",
  name: "Grace",
  amountCents: 0,
  published: false,
  createdAt: new Date(NOW.getTime() - (PENDING_SPONSORSHIP_DAYS + 1) * DAY_MS).toISOString(),
};

/** The sponsor the takeover of {@link OPEN} answers with. */
const TAKEN_OVER: Sponsor = {
  id: "s1",
  name: OPEN.name,
  socialMedia: OPEN.socialMedia,
  avatarId: null,
  claim: OPEN.claim,
  published: OPEN.published,
  paidOn: "2026-11-17",
  amountCents: 5_550,
  createdAt: "2026-11-17T12:00:00.000Z",
  updatedAt: "2026-11-17T12:00:00.000Z",
};

/**
 * Renders the page with a fresh query client.
 *
 * @returns The client, so a test can watch what it invalidates.
 */
function renderPage(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SponsorshipRequestsPage />
    </QueryClientProvider>,
  );
  return queryClient;
}

/**
 * The table row that names somebody.
 *
 * @param name - The name in the row.
 * @returns The row.
 */
async function rowOf(name: string): Promise<HTMLElement> {
  return (await screen.findByText(name)).closest("tr") as HTMLElement;
}

describe("SponsorshipRequestsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    renderElementsAtWidth(WIDE_TABLE_PX);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetchSponsoringConfig.mockResolvedValue({
      ...SPONSORING_DEFAULTS,
      sponsorMinimumCents: STORED_MINIMUM_CENTS,
    });
    mocks.fetchSponsorshipRequests.mockResolvedValue([OPEN, EXPIRED]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("lists each request with its printed reference, profile, sentence, amount, consent, day and days left", async () => {
    renderPage();

    const open = await rowOf("Ada");
    expect(within(open).getByText(REFERENCE_PRINTED)).not.toBeNull();
    expect(within(open).getByText("Music for everybody.")).not.toBeNull();
    expect(within(open).getByRole("link").getAttribute("href")).toBe("https://chaos.social/@ada");
    expect(within(open).getByText("€60")).not.toBeNull();
    expect(within(open).getByText(sm.publishedYes)).not.toBeNull();
    expect(within(open).getByText("2026-11-07")).not.toBeNull();
    expect(within(open).getByText(String(PENDING_SPONSORSHIP_DAYS - 10))).not.toBeNull();

    const expired = await rowOf("Grace");
    expect(within(expired).getByText(sm.requestAmountNone)).not.toBeNull();
    expect(within(expired).getByText(sm.publishedNo)).not.toBeNull();
    expect(within(expired).getByText(sm.requestExpired)).not.toBeNull();
  });

  it("says how long a request stands while there is none", async () => {
    mocks.fetchSponsorshipRequests.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(sm.requestsEmpty)).not.toBeNull();
    expect(screen.getByText(sm.requestsEmptyHint.replace("{days}", String(PENDING_SPONSORSHIP_DAYS)))).not.toBeNull();
  });

  it("takes a request over with the amount that arrived and the day, and refreshes the requests and the ledger", async () => {
    mocks.takeOverSponsorshipRequest.mockResolvedValue(TAKEN_OVER);
    const queryClient = renderPage();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(within(await rowOf("Ada")).getByRole("button", { name: sm.requestTakeOver }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(REFERENCE_PRINTED)).not.toBeNull();
    const amount = within(dialog).getByLabelText(sm.amountLabel) as HTMLInputElement;
    expect(amount.value).toBe("60");
    expect((within(dialog).getByLabelText(sm.sponsorPaidOnLabel) as HTMLInputElement).value).toBe("2026-11-17");

    fireEvent.change(amount, { target: { value: "55,50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: sm.requestTakeOver }));

    await waitFor(() =>
      expect(mocks.takeOverSponsorshipRequest).toHaveBeenCalledWith("r1", { amountCents: 5_550, paidOn: "2026-11-17" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: SPONSORSHIP_REQUESTS_QUERY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: LEDGER_QUERY_KEY });
  });

  it("presets the stored sponsoring minimum when the request announced nothing", async () => {
    renderPage();

    fireEvent.click(within(await rowOf("Grace")).getByRole("button", { name: sm.requestTakeOver }));
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(mocks.fetchSponsoringConfig).toHaveBeenCalled());
    expect((within(dialog).getByLabelText(sm.amountLabel) as HTMLInputElement).value).toBe("75");
  });

  it("keeps Take over off while the amount is no amount the route accepts", async () => {
    renderPage();

    fireEvent.click(within(await rowOf("Ada")).getByRole("button", { name: sm.requestTakeOver }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(sm.amountLabel), { target: { value: "0" } });

    const confirm = within(dialog).getByRole("button", { name: sm.requestTakeOver }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(dialog).getByText(/Enter an amount in euros from 0\.01 to/)).not.toBeNull();
    expect(mocks.takeOverSponsorshipRequest).not.toHaveBeenCalled();
  });

  it("names the server's reason, its code and its error id when the takeover is refused, and stays open", async () => {
    mocks.takeOverSponsorshipRequest.mockRejectedValue(
      Object.assign(new Error("The sponsorship request does not exist. (MC-RES-0003)"), {
        status: 404,
        errorCode: "MC-RES-0003",
        errorId: "err-7",
      }),
    );
    renderPage();

    fireEvent.click(within(await rowOf("Ada")).getByRole("button", { name: sm.requestTakeOver }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: sm.requestTakeOver }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "The sponsorship request does not exist. (MC-RES-0003) Error ID: err-7",
    );
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("asks before removing a request, names it by its reference, and refreshes only the requests", async () => {
    mocks.deleteSponsorshipRequest.mockResolvedValue(undefined);
    const queryClient = renderPage();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    fireEvent.click(within(await rowOf("Ada")).getByRole("button", { name: dashboardCopy.common.remove }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(`${REFERENCE_PRINTED} · Ada`)).not.toBeNull();
    expect(within(dialog).getByText(sm.requestRemoveConfirmDescription)).not.toBeNull();
    expect(mocks.deleteSponsorshipRequest).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: dashboardCopy.common.remove }));
    await waitFor(() => expect(mocks.deleteSponsorshipRequest).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: SPONSORSHIP_REQUESTS_QUERY_KEY }));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: LEDGER_QUERY_KEY });
  });

  it("names the server's reason when the list cannot be read", async () => {
    mocks.fetchSponsorshipRequests.mockRejectedValue(
      Object.assign(new Error("Something went wrong. (MC-SYS-0001)"), { status: 500, errorId: "err-3" }),
    );
    renderPage();

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. (MC-SYS-0001) Error ID: err-3");
  });
});
