import type { VinylLayout } from "@musiccloud/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Turntable } from "@/components/vinyl/Turntable";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

const VINYL_LAYOUT: VinylLayout = {
  discogsReleaseId: "10013707",
  sides: [
    {
      label: "B",
      tracks: [{ durationMs: 714_000, position: "B1", title: "J.O.S." }],
    },
  ],
};

describe("Turntable", () => {
  it("renders deck chrome and delegates record rendering to VinylRecord props", () => {
    const { container } = render(
      <Turntable
        className="h-96 w-96"
        record={{
          className: "h-full w-full",
          labelArtworkUrl: "/covers/blue-train.jpg",
          labelSubtitle: "John Coltrane",
          labelTitle: "Blue Train",
          labelYear: "1958",
          spinState: VinylSpinState.Playing,
        }}
        swapKey="turntable-test"
      />,
    );

    const turntable = screen.getByLabelText("Turntable");

    // The deck branding, LED and spindle are decorative (aria-hidden), so they
    // are pinned via their data attributes rather than an accessible name.
    expect(container.querySelector("[data-turntable-brand='true']")).toBeInTheDocument();
    expect(screen.getByText("33")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("STANDBY")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-led='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-spindle='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-spindle-shadow='true']")).toBeInTheDocument();
    expect(within(turntable).getByLabelText("Vinyl record for Blue Train")).toHaveAttribute(
      "data-spin-state",
      VinylSpinState.Playing,
    );
    expect(container.querySelector("[data-turntable-platter='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-speed-knob='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-speed-rotor='true']")).toHaveStyle({
      transform: "rotate(210deg)",
    });
  });

  it("shows a supplied layout side and its orange layout indicator without a playback hub", () => {
    const { container } = render(
      <Turntable
        className="h-96 w-96"
        record={{
          className: "h-full w-full",
          labelTitle: "The Sermon!",
          sideLayout: VINYL_LAYOUT.sides[0],
          vinylLayout: VINYL_LAYOUT,
        }}
        swapKey="turntable-layout-test"
      />,
    );

    expect(screen.getByText("SIDE B")).toBeInTheDocument();
    expect(container.querySelector("[data-turntable-layout-led='true']")).toHaveAttribute(
      "data-turntable-layout-led-state",
      "lit",
    );
  });
});
