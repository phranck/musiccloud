import { type AdminArtistEntityListItem, ENDPOINTS } from "@musiccloud/shared";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useInfiniteAdminTable: vi.fn(),
}));

vi.mock("@/features/music/hooks/useInfiniteAdminTable", () => ({
  useInfiniteAdminTable: mocks.useInfiniteAdminTable,
}));

import { ArtistEntitiesPage } from "@/features/music/ArtistEntitiesPage";

const GROUP: AdminArtistEntityListItem = {
  id: "artist-radiohead",
  name: "Radiohead",
  entityType: "group",
  verificationStatus: "candidate",
  trackCreditCount: 12,
  albumCreditCount: 3,
  hasProfile: true,
  shortId: "radiohead",
  createdAt: 1_700_000_000_000,
};

const PERSON: AdminArtistEntityListItem = {
  ...GROUP,
  id: "artist-thom",
  name: "Thom Yorke",
  entityType: "person",
  verificationStatus: "verified",
  trackCreditCount: 0,
  albumCreditCount: 0,
  hasProfile: false,
  shortId: null,
};

function tableValue(items: AdminArtistEntityListItem[]) {
  return {
    items,
    total: items.length,
    isInitialLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    isError: false,
    errorMessage: null,
    searchInput: "",
    setSearchInput: vi.fn(),
    sortBy: "created_at",
    sortDir: "desc",
    setSort: vi.fn(),
    editMode: false,
    toggleEditMode: vi.fn(),
    selectedIds: new Set<string>(),
    selectedCount: 0,
    allSelected: false,
    toggleAll: vi.fn(),
    toggleRow: vi.fn(),
    deletingIds: new Set<string>(),
    deleteSelected: vi.fn(),
    refreshSilently: vi.fn(),
    sentinelRef: { current: null },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ArtistEntitiesPage />
    </MemoryRouter>,
  );
}

describe("ArtistEntitiesPage", () => {
  beforeEach(() => {
    mocks.useInfiniteAdminTable.mockReturnValue(tableValue([GROUP, PERSON]));
  });

  it("lists the entities from the admin endpoint, with no way to delete them", () => {
    renderPage();

    expect(mocks.useInfiniteAdminTable).toHaveBeenCalledWith({ endpoint: ENDPOINTS.admin.artistEntities.list });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText("2 artist entities")).not.toBeNull();
  });

  it("opens an entity's detail page from its name", () => {
    renderPage();

    expect(screen.getByRole("link", { name: "Radiohead" }).getAttribute("href")).toBe(
      "/artist-entities/artist-radiohead",
    );
    expect(screen.getByRole("link", { name: "Thom Yorke" }).getAttribute("href")).toBe("/artist-entities/artist-thom");
  });

  it("names the type and status, counts the credits and links the artist page where there is one", () => {
    renderPage();

    const [groupRow, personRow] = screen.getAllByRole("row").slice(1);
    expect(groupRow?.textContent).toContain("Group");
    expect(groupRow?.textContent).toContain("Candidate");
    expect(groupRow?.textContent).toContain("12");
    expect(screen.getByRole("link", { name: "radiohead" }).getAttribute("href")).toMatch(/\/radiohead$/);
    expect(personRow?.textContent).toContain("Person");
    expect(personRow?.textContent).toContain("Verified");
    expect(personRow?.textContent).toContain("None");
  });

  it("says so when there is no entity", () => {
    mocks.useInfiniteAdminTable.mockReturnValue(tableValue([]));
    renderPage();

    expect(screen.getByText("No artist entities yet")).not.toBeNull();
  });
});
