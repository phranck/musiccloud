import type { Sponsor } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSponsorAvatar: vi.fn(),
  uploadSponsorAvatar: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  resolveSponsorAvatar: mocks.resolveSponsorAvatar,
  uploadSponsorAvatar: mocks.uploadSponsorAvatar,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { SponsorEditCard } from "./SponsorEditCard";

const sm = dashboardCopy.sponsoring;

/** The id of the picture stored with {@link STORED}, a hex SHA-256. */
const STORED_AVATAR_ID = "a".repeat(64);

/** The id the backend answers a picture lookup with, a hex SHA-256. */
const FETCHED_AVATAR_ID = "b".repeat(64);

/** A stored sponsor with a picture and no social media account yet. */
const STORED: Sponsor = {
  id: "s1",
  name: "Ada",
  socialMedia: [],
  avatarId: STORED_AVATAR_ID,
  claim: "",
  published: true,
  paidOn: "2026-11-07",
  amountCents: 5_000,
  createdAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

/**
 * Renders the card for `sponsor` inside a query client of its own.
 *
 * @param sponsor - The sponsor to change, or `null` for a new one.
 * @returns What `render` returns.
 */
function renderCard(sponsor: Sponsor | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SponsorEditCard sponsor={sponsor} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

/**
 * Types `url` into the empty address field.
 *
 * @param url - The address to enter.
 */
function enterAddress(url: string) {
  fireEvent.change(screen.getByLabelText(sm.sponsorSocialMediaEditor.urlPlaceholder), { target: { value: url } });
}

describe("SponsorEditCard", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.resolveSponsorAvatar.mockResolvedValue({ avatarId: FETCHED_AVATAR_ID });
  });

  it("keeps a stored sponsor's picture when an account is added", async () => {
    renderCard(STORED);
    expect(screen.getByRole("img", { name: "Ada" }).getAttribute("src")).toContain(STORED_AVATAR_ID);

    enterAddress("https://github.com/ada");

    const save = screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    expect(mocks.resolveSponsorAvatar).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Ada" }).getAttribute("src")).toContain(STORED_AVATAR_ID);
  });

  it("looks the picture up while the card has none", async () => {
    renderCard({ ...STORED, avatarId: null });

    enterAddress("https://github.com/ada");

    expect((await screen.findByRole("img", { name: "Ada" })).getAttribute("src")).toContain(FETCHED_AVATAR_ID);
  });

  it("replaces the picture it fetched itself when the address changes", async () => {
    renderCard({ ...STORED, avatarId: null });
    enterAddress("https://github.com/ada");
    await screen.findByRole("img", { name: "Ada" });

    const replacement = "c".repeat(64);
    mocks.resolveSponsorAvatar.mockResolvedValue({ avatarId: replacement });
    enterAddress("https://github.com/lovelace");

    await waitFor(() => expect(screen.getByRole("img", { name: "Ada" }).getAttribute("src")).toContain(replacement));
  });

  it("replaces a stored picture when the operator fetches again by hand", async () => {
    renderCard(STORED);
    enterAddress("https://github.com/ada");

    fireEvent.click(await screen.findByRole("button", { name: sm.sponsorRefreshPicture }));

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Ada" }).getAttribute("src")).toContain(FETCHED_AVATAR_ID),
    );
  });
});
