import { describe, expect, it } from "vitest";
import { isManualScrollIntent, resolveScrollSpySelection, selectActiveScrollTarget } from "./api-scroll-spy";

describe("API scroll-spy target selection", () => {
  it("keeps the clicked target active while the next anchor remains below the activation line", () => {
    const targets = [
      { top: -240, value: "Backend" },
      { top: 32, value: "Dashboard" },
      { top: 214, value: "Database" },
    ];

    expect(selectActiveScrollTarget(targets, 32)).toBe("Dashboard");
  });

  it("tolerates Safari subpixel rounding at the activation line", () => {
    const targets = [
      { top: -599.09375, value: "Creative Commons audio" },
      { top: 32.21875, value: "Bandcamp availability" },
      { top: 418.75, value: "Creative Commons download" },
    ];

    expect(selectActiveScrollTarget(targets, 32)).toBe("Bandcamp availability");
  });

  it("advances only after the next anchor crosses the activation line", () => {
    const targets = [
      { top: -420, value: "Backend" },
      { top: -150, value: "Dashboard" },
      { top: 31, value: "Database" },
      { top: 206, value: "Developer portal" },
    ];

    expect(selectActiveScrollTarget(targets, 32)).toBe("Database");
  });

  it("selects the first target before any anchor reaches the activation line", () => {
    const targets = [
      { top: 180, value: "Integration guide" },
      { top: 620, value: "SDK downloads" },
    ];

    expect(selectActiveScrollTarget(targets, 32)).toBe("Integration guide");
  });

  it("pins an explicit selection while smooth scrolling crosses intermediate anchors", () => {
    const selection = resolveScrollSpySelection(
      [
        { top: -320, value: "Artist" },
        { top: -40, value: "Creative Commons" },
        { top: 480, value: "Health" },
      ],
      32,
      "Health",
    );

    expect(selection).toEqual({ pinnedTargetReached: false, value: "Health" });
  });

  it("releases the pinned selection after Safari settles at the activation line", () => {
    const selection = resolveScrollSpySelection(
      [
        { top: -420, value: "Creative Commons" },
        { top: 32.21875, value: "Health" },
      ],
      32,
      "Health",
    );

    expect(selection).toEqual({ pinnedTargetReached: true, value: "Health" });
  });

  it("recognizes only direct user input that can interrupt programmatic scrolling", () => {
    expect(isManualScrollIntent("wheel")).toBe(true);
    expect(isManualScrollIntent("touchstart")).toBe(true);
    expect(isManualScrollIntent("pointerdown")).toBe(true);
    expect(isManualScrollIntent("keydown", "PageDown")).toBe(true);
    expect(isManualScrollIntent("keydown", "a")).toBe(false);
    expect(isManualScrollIntent("scroll")).toBe(false);
  });
});
