import type { ArtistProfileCacheStatus as ArtistProfileCacheStatusValue } from "@musiccloud/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ArtistProfileCacheStatus } from "@/features/music/ArtistProfileCacheStatus";

function status(
  state: ArtistProfileCacheStatusValue["state"],
  overrides: Partial<ArtistProfileCacheStatusValue> = {},
): ArtistProfileCacheStatusValue {
  return {
    state,
    profileUpdatedAt: "2026-07-19T20:00:00.000Z",
    ageMs: 5000,
    providers: ["spotify", "lastfm"],
    latestManualRefresh: null,
    ...overrides,
  };
}

describe("ArtistProfileCacheStatus", () => {
  it.each([
    ["fresh", "Fresh"],
    ["stale", "Stale"],
    ["missing", "Missing"],
    ["refreshing", "Refreshing"],
    ["failed", "Failed"],
  ] as const)("renders the %s state", (stateValue, label) => {
    render(<ArtistProfileCacheStatus status={status(stateValue)} />);

    expect(screen.getByText(label)).not.toBeNull();
  });

  it("shows providers, age, timestamp, and the latest safe manual outcome", () => {
    const failed = status("failed", {
      latestManualRefresh: {
        trigger: "manual",
        occurredAt: "2026-07-19T20:00:00.000Z",
        completedAt: "2026-07-19T20:00:05.000Z",
        outcome: "failed",
        errorCode: "MC-API-0001",
        errorId: "error-38",
      },
    }) as ArtistProfileCacheStatusValue & { cause: string };
    failed.cause = "private redacted audit cause";

    render(<ArtistProfileCacheStatus status={failed} />);

    expect(screen.getByText("Spotify, Last.fm")).not.toBeNull();
    expect(screen.getByText("Age: 5s").getAttribute("title")).toBe("2026-07-19T20:00:00.000Z");
    expect(screen.getByText("Last manual refresh: Failed")).not.toBeNull();
    expect(screen.getByText("MC-API-0001 · error-38")).not.toBeNull();
    expect(screen.queryByText(/private redacted audit cause/i)).toBeNull();
  });

  it("omits profile details when the cache is missing", () => {
    render(
      <ArtistProfileCacheStatus status={status("missing", { profileUpdatedAt: null, ageMs: null, providers: [] })} />,
    );

    expect(screen.queryByText(/^Age:/)).toBeNull();
    expect(screen.getByText("No profile providers")).not.toBeNull();
  });
});
