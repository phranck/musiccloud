import type { AdminArtistListItem } from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

const mocks = vi.hoisted(() => ({
  useInfiniteAdminTable: vi.fn(),
}));

vi.mock("@/features/music/hooks/useInfiniteAdminTable", () => ({
  useInfiniteAdminTable: mocks.useInfiniteAdminTable,
}));

vi.mock("@/components/ui/Table", () => ({
  DataTable: ({
    columns,
    data,
  }: {
    columns: Array<{ id: string; cell: (row: unknown) => unknown }>;
    data: Array<{ id: string }>;
  }) => (
    <div data-testid="artist-table">
      {data.map((row) => (
        <div key={row.id}>{columns.map((column) => <div key={column.id}>{column.cell(row) as never}</div>)}</div>
      ))}
    </div>
  ),
}));

import { ArtistsPage } from "@/features/music/ArtistsPage";

const ARTIST: AdminArtistListItem = {
  id: "artist-1",
  artistEntityId: "artist-1",
  name: "Slowdive",
  imageUrl: null,
  genres: ["dream pop"],
  sourceService: "deezer",
  linkCount: 2,
  createdAt: 1_700_000_000_000,
  shortId: "slowdive",
  profileCache: {
    state: "fresh",
    profileUpdatedAt: "2026-07-19T20:00:00.000Z",
    ageMs: 5000,
    providers: ["spotify"],
    latestManualRefresh: null,
  },
};

function tableValue() {
  return {
    items: [ARTIST],
    total: 1,
    isInitialLoading: false,
    isRefreshing: false,
    isLoadingMore: false,
    isError: false,
    errorMessage: null,
    searchInput: "",
    setSearchInput: vi.fn(),
    sortBy: null,
    sortDir: null,
    handleSort: vi.fn(),
    editMode: false,
    toggleEditMode: vi.fn(),
    selectedIds: new Set<string>(),
    selectedCount: 0,
    allSelected: false,
    toggleAll: vi.fn(),
    toggleRow: vi.fn(),
    deletingIds: new Set<string>(),
    deleteSelected: vi.fn(),
    refreshSilently: vi.fn().mockResolvedValue(undefined),
    sentinelRef: { current: null },
    scrollContainerRef: { current: null },
  };
}

describe("ArtistsPage profile cache controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.useInfiniteAdminTable.mockReturnValue(tableValue());
  });

  it("uses the shared row contract and renders both explicit independent actions", async () => {
    let resolveRefresh: () => void = () => {};
    vi.spyOn(api, "post").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = () => resolve(undefined);
        }),
    );

    render(<ArtistsPage />);

    expect(screen.getByText("Fresh")).not.toBeNull();
    expect(screen.getByText("Spotify")).not.toBeNull();
    const reResolve = screen.getByRole("button", { name: "Re-resolve" }) as HTMLButtonElement;
    const refreshProfile = screen.getByRole("button", { name: "Refresh profile" }) as HTMLButtonElement;

    fireEvent.click(refreshProfile);

    expect(refreshProfile.disabled).toBe(true);
    expect(reResolve.disabled).toBe(false);
    expect(screen.getByTestId("artist-table")).not.toBeNull();
    expect(screen.getByTestId("artist-table").parentElement?.className).toContain("opacity-100");

    resolveRefresh();
    await waitFor(() => expect(refreshProfile.disabled).toBe(false));
  });
});
