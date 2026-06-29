import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Turntable } from "@/components/vinyl/Turntable";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

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
    expect(container.querySelector("[data-turntable-speed-indicator='true']")).toHaveStyle({
      transform: "translateY(-50%) rotate(210deg)",
      transformOrigin: "0% 50%",
    });
  });
});
