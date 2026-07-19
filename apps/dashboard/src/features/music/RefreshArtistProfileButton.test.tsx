import { ENDPOINTS } from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RefreshArtistProfileButton } from "@/features/music/RefreshArtistProfileButton";
import { api } from "@/lib/api";

describe("RefreshArtistProfileButton", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts by artistEntityId and disables only the row mutation", async () => {
    let resolvePost: () => void = () => {};
    vi.spyOn(api, "post").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePost = () => resolve(undefined);
        }),
    );
    const refreshSilently = vi.fn().mockResolvedValue(undefined);

    render(
      <div>
        <RefreshArtistProfileButton artistEntityId="artist-1" refreshSilently={refreshSilently} />
        <button type="button">Other action</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh profile" }));

    expect(api.post).toHaveBeenCalledWith(ENDPOINTS.admin.artists.refreshProfile("artist-1"));
    expect((screen.getByRole("button", { name: "Refresh profile" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Other action" }) as HTMLButtonElement).disabled).toBe(false);
    expect(refreshSilently).not.toHaveBeenCalled();

    resolvePost();
    await waitFor(() => expect(refreshSilently).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Refreshed profile" }) as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("awaits a silent refetch after failure and exposes the canonical errorId", async () => {
    vi.spyOn(api, "post").mockRejectedValueOnce(
      Object.assign(new Error("Artist profile providers are unavailable. (MC-API-0001)"), {
        errorCode: "MC-API-0001",
        errorId: "error-38",
      }),
    );
    const refreshSilently = vi.fn().mockResolvedValue(undefined);

    render(<RefreshArtistProfileButton artistEntityId="artist-1" refreshSilently={refreshSilently} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh profile" }));

    await waitFor(() => expect(refreshSilently).toHaveBeenCalledTimes(1));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Artist profile providers are unavailable. (MC-API-0001)",
    );
    expect(screen.getByRole("alert").textContent).toContain("Error ID: error-38");
    expect((screen.getByRole("button", { name: "Refresh profile" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
