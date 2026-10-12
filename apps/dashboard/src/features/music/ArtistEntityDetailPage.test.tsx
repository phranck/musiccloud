import { type AdminArtistEntityDetail, type AdminArtistMembership, ENDPOINTS } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

// The real header portals into the shell. These tests read only its title and
// the back button in its leading slot.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ title, renderLeading }: { title: string; renderLeading?: () => React.ReactNode }) => (
    <div>
      {renderLeading?.()}
      <h1>{title}</h1>
    </div>
  ),
}));

import { ArtistEntityDetailPage } from "@/features/music/ArtistEntityDetailPage";

const SOURCE = {
  provider: "musicbrainz",
  url: "https://musicbrainz.org/artist/a74b1b7f-71a5-4011-9441-d0b5e4122711",
  fetchedAt: Date.UTC(2026, 9, 9, 12),
};

const STINT: AdminArtistMembership = {
  id: "membership-1",
  groupArtistEntityId: "artist-radiohead",
  groupName: "Radiohead",
  memberArtistEntityId: "artist-thom",
  memberName: "Thom Yorke",
  roles: ["lead vocals", "piano"],
  begin: { precision: "year", year: 1985, month: null, day: null },
  end: null,
  isCurrent: true,
  source: SOURCE,
};

const GROUP: AdminArtistEntityDetail = {
  id: "artist-radiohead",
  name: "Radiohead",
  entityType: "group",
  verificationStatus: "candidate",
  hasProfile: true,
  shortId: "radiohead",
  createdAt: Date.UTC(2026, 0, 2, 12),
  names: [
    { id: "name-1", name: "Radiohead", nameType: "canonical", locale: null },
    { id: "name-2", name: "On a Friday", nameType: "alias", locale: "en" },
  ],
  events: [
    {
      id: "event-1",
      eventType: "formed",
      date: { precision: "month", year: 1985, month: 4, day: null },
      source: SOURCE,
    },
  ],
  members: [
    STINT,
    {
      ...STINT,
      id: "membership-2",
      memberArtistEntityId: "artist-jonny",
      memberName: "Jonny Greenwood",
      roles: ["guitar"],
      begin: { precision: "year", year: 1985, month: null, day: null },
      end: { precision: "day", year: 2003, month: 5, day: 6 },
      isCurrent: false,
      source: null,
    },
  ],
  memberOf: [],
};

const PERSON: AdminArtistEntityDetail = {
  ...GROUP,
  id: "artist-nobody",
  name: "Nobody",
  entityType: "person",
  hasProfile: false,
  shortId: null,
  names: [],
  events: [],
  members: [],
  memberOf: [],
};

function renderPage(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/artist-entities/${id}`]}>
        <Routes>
          <Route path="/artist-entities/:id" element={<ArtistEntityDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The section whose header carries the given title. */
function section(title: string): HTMLElement {
  const header = screen.getByText(title);
  const root = header.closest(".rounded-xl");
  if (!(root instanceof HTMLElement)) throw new Error(`No section titled ${title}`);
  return root;
}

describe("ArtistEntityDetailPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a group with its names, its formation and its members, each fact with its source", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(GROUP);
    renderPage("artist-radiohead");

    expect(await screen.findByRole("heading", { name: "Radiohead" })).not.toBeNull();
    expect(get).toHaveBeenCalledWith(ENDPOINTS.admin.artistEntities.detail("artist-radiohead"));

    const identity = section("Identity");
    expect(within(identity).getByText("Group")).not.toBeNull();
    expect(within(identity).getByText("Candidate")).not.toBeNull();
    expect(within(identity).getByText("artist-radiohead")).not.toBeNull();

    const names = section("Names");
    expect(within(names).getByText("On a Friday")).not.toBeNull();
    expect(within(names).getByText("Alias")).not.toBeNull();
    expect(within(names).getByText("en")).not.toBeNull();
    expect(within(names).getByText("Any")).not.toBeNull();

    const lifecycle = section("Lifecycle");
    expect(within(lifecycle).getByText("Formed")).not.toBeNull();
    expect(within(lifecycle).getByText("April 1985")).not.toBeNull();
    expect(within(lifecycle).getByRole("link", { name: "MusicBrainz" }).getAttribute("href")).toBe(SOURCE.url);
    expect(within(lifecycle).getByText("Read Oct 9, 2026")).not.toBeNull();

    const members = section("Members");
    expect(within(members).getByRole("link", { name: "Thom Yorke" }).getAttribute("href")).toBe(
      "/artist-entities/artist-thom",
    );
    expect(within(members).getByText("lead vocals, piano")).not.toBeNull();
    expect(within(members).getByText("Since 1985")).not.toBeNull();
    expect(within(members).getByText("1985 to May 6, 2003")).not.toBeNull();
    expect(within(members).getByText("No source")).not.toBeNull();

    expect(screen.queryByText("Member of")).toBeNull();
  });

  it("says what is missing for a person with nothing recorded", async () => {
    vi.spyOn(api, "get").mockResolvedValue(PERSON);
    renderPage("artist-nobody");

    expect(await screen.findByText("No lifecycle dates recorded.")).not.toBeNull();
    expect(screen.getByText("No names recorded.")).not.toBeNull();
    expect(screen.getByText("Not recorded as a member of any group.")).not.toBeNull();
    expect(screen.queryByText("Members")).toBeNull();
    expect(within(section("Identity")).getByText("None")).not.toBeNull();
  });

  it("writes a date only as precisely as it is known", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      ...PERSON,
      events: [
        { id: "event-1", eventType: "birth", date: { precision: "day", year: 1968, month: 10, day: 7 }, source: null },
        {
          id: "event-2",
          eventType: "death",
          date: { precision: "unknown", year: null, month: null, day: null },
          source: null,
        },
      ],
      memberOf: [{ ...STINT, begin: null, end: null, isCurrent: null }],
    });
    renderPage("artist-nobody");

    const lifecycle = await screen.findByText("Born");
    expect(within(section("Lifecycle")).getByText("October 7, 1968")).not.toBeNull();
    expect(lifecycle).not.toBeNull();
    expect(within(section("Lifecycle")).getByText("Unknown")).not.toBeNull();
    expect(within(section("Member of")).getByText("Dates unknown")).not.toBeNull();
  });

  it("says an unknown entity is gone and how to find it", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      Object.assign(new Error("The requested resource was not found."), { status: 404 }),
    );
    renderPage("artist-gone");

    expect(await screen.findByText("Artist entity not found")).not.toBeNull();
    expect(screen.getByText(/merged into another entity/)).not.toBeNull();
  });

  it("names the server's message and error id when the read fails", async () => {
    vi.spyOn(api, "get").mockRejectedValue(
      Object.assign(new Error("The database is not reachable."), { status: 503, errorId: "err-42" }),
    );
    renderPage("artist-radiohead");

    // A failure other than a 404 is asked for once more, after the query's retry delay.
    expect(await screen.findByText("Could not load the artist entity", undefined, { timeout: 4000 })).not.toBeNull();
    expect(screen.getByText("The database is not reachable. Error ID: err-42")).not.toBeNull();
  });
});
