import { ENDPOINTS } from "@musiccloud/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemPage } from "@/features/system/SystemPage";
import { api } from "@/lib/api";

/**
 * Answers the two GET requests `SystemPage` makes on mount: the site settings
 * for the tracking toggle and the data counts for the Danger Zone.
 *
 * @param counts - The number of tracks and albums the data counts endpoint
 *   reports, which the Danger Zone description renders with their labels.
 */
function mockSystemRequests(counts: { tracks: number; albums: number }) {
  vi.spyOn(api, "get").mockImplementation((endpoint: string) => {
    if (endpoint === ENDPOINTS.admin.dataCounts) return Promise.resolve(counts);
    return Promise.resolve({ tracking_enabled: "true" });
  });
}

describe("SystemPage Danger Zone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("names several tracks and albums with the English plurals", async () => {
    mockSystemRequests({ tracks: 2, albums: 3 });

    render(<SystemPage />);

    expect(await screen.findByText(/Deletes 2 Tracks and 3 Albums including/)).toBeTruthy();
  });

  it("names a single track and a single album with the English singulars", async () => {
    mockSystemRequests({ tracks: 1, albums: 1 });

    render(<SystemPage />);

    expect(await screen.findByText(/Deletes 1 Track and 1 Album including/)).toBeTruthy();
  });
});
