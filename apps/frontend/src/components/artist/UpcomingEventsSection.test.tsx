import type { ArtistEvent } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpcomingEventsSection } from "@/components/artist/UpcomingEventsSection";

const ROW_HEIGHT = 80;

function event(index: number): ArtistEvent {
  return {
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    venueName: `Venue ${index + 1}`,
    city: "Vienna",
    country: "AT",
    ticketUrl: `https://example.test/tickets/${index + 1}`,
    source: "bandsintown",
  };
}

describe("UpcomingEventsSection viewport", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ) {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: this.matches("a") ? ROW_HEIGHT : 0,
        width: 0,
        height: this.matches("a") ? ROW_HEIGHT : 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("caps more than four events at four and a half rows", () => {
    const { container } = render(
      <UpcomingEventsSection
        events={Array.from({ length: 5 }, (_, index) => event(index))}
        userRegion="AT"
        locale="en"
      />,
    );

    expect(container.querySelector(".overflow-y-auto")).toHaveStyle({ maxHeight: "360px" });
  });
});
