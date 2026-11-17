import type { Sponsor, SponsorInput } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSponsors: vi.fn(),
  createSponsor: vi.fn(),
  updateSponsor: vi.fn(),
  deleteSponsor: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchSponsors: mocks.fetchSponsors,
  createSponsor: mocks.createSponsor,
  updateSponsor: mocks.updateSponsor,
  deleteSponsor: mocks.deleteSponsor,
}));

// The real header hands its actions to the layout's slot, which this test does not mount.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { SponsorsPage } from "./SponsorsPage";

const sm = dashboardCopy.sponsoring;

/** The day the page counts from: 2026-11-17, local noon so no time zone moves it. */
const NOW = new Date(2026, 10, 17, 12);

/** A sponsor who paid 10 days before {@link NOW}, so 355 days are left. */
const CURRENT: Sponsor = {
  id: "s1",
  name: "Ada",
  links: ["https://chaos.social/@ada"],
  claim: "Music for everybody.",
  published: true,
  paidOn: "2026-11-07",
  amountCents: 5_000,
  createdAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

/** A sponsor whose year ran out before {@link NOW}. */
const ENDED: Sponsor = { ...CURRENT, id: "s2", name: "Grace", paidOn: "2025-01-01" };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SponsorsPage />
    </QueryClientProvider>,
  );
}

describe("SponsorsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.fetchSponsors.mockResolvedValue([CURRENT, ENDED]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists each sponsor with the days left of their year, and an ended year as ended", async () => {
    renderPage();

    expect(await screen.findByText("Ada")).not.toBeNull();
    expect(screen.getByText("355")).not.toBeNull();
    expect(screen.getByText(sm.sponsorExpired)).not.toBeNull();
  });

  it("says how long a sponsor stays on the page while there is none", async () => {
    mocks.fetchSponsors.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(sm.sponsorsEmpty)).not.toBeNull();
    expect(screen.getByText(sm.sponsorsEmptyHint)).not.toBeNull();
  });

  it("records a sponsor with one address per line, with Save off until the name is there", async () => {
    mocks.createSponsor.mockImplementation(async (input: SponsorInput) => ({ ...CURRENT, ...input, id: "s3" }));
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: sm.sponsorAdd }));
    const save = screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(sm.sponsorNameLabel), { target: { value: " Linus " } });
    fireEvent.change(screen.getByLabelText(sm.sponsorLinksLabel), {
      target: { value: "https://github.com/linus\nhttps://linus.example" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.createSponsor).toHaveBeenCalled());
    expect(mocks.createSponsor.mock.calls[0]?.[0]).toEqual({
      name: "Linus",
      links: ["https://github.com/linus", "https://linus.example"],
      claim: "",
      published: false,
      paidOn: "2026-11-17",
    });
  });

  it("keeps Save off while an address is not https", async () => {
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: sm.sponsorAdd }));
    fireEvent.change(screen.getByLabelText(sm.sponsorNameLabel), { target: { value: "Linus" } });
    fireEvent.change(screen.getByLabelText(sm.sponsorLinksLabel), { target: { value: "http://linus.example" } });

    expect((screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(sm.sponsorLinksInvalid.replace("{max}", "8"))).not.toBeNull();
  });

  it("asks before removing a sponsor and says their donations stay", async () => {
    mocks.deleteSponsor.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Ada");

    fireEvent.click(screen.getAllByRole("button", { name: dashboardCopy.common.remove })[0] as HTMLElement);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(sm.sponsorRemoveConfirmDescription)).not.toBeNull();
    expect(mocks.deleteSponsor).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: dashboardCopy.common.remove }));
    await waitFor(() => expect(mocks.deleteSponsor).toHaveBeenCalled());
  });
});
