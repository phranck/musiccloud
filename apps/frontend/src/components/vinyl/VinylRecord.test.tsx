import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VinylRecord } from "@/components/vinyl/VinylRecord";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { vinylGrooveSpiralPath, vinylSideGroovePath } from "@/lib/media/vinyl-geometry";

const originalAnimate = HTMLElement.prototype.animate;

afterEach(() => {
  if (originalAnimate) {
    HTMLElement.prototype.animate = originalAnimate;
  } else {
    // jsdom does not implement WAAPI by default.
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  vi.restoreAllMocks();
});

describe("VinylRecord", () => {
  it("renders a circular record with cover art on the paper label and the requested spin state", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelArtworkUrl="/covers/kind-of-blue.jpg"
        labelSubtitle="Miles Davis"
        labelTitle="Kind of Blue"
        labelYear="1959"
        spinState={VinylSpinState.Playing}
      />,
    );

    const record = screen.getByLabelText("Vinyl record for Kind of Blue");

    expect(record).toHaveAttribute("data-spin-state", VinylSpinState.Playing);
    expect(record.className).toContain("rounded-full");
    // The groove bitmap is also an <img> now, so target the cover label directly
    // instead of the first <img> in the tree.
    expect(container.querySelector("[data-vinyl-label-artwork='true']")).toHaveAttribute(
      "src",
      "/covers/kind-of-blue.jpg",
    );
    expect(screen.getByText("Kind of Blue")).toBeInTheDocument();
    expect(screen.getByText("Miles Davis")).toBeInTheDocument();
    expect(screen.getByText("1959")).toBeInTheDocument();
  });

  it("renders fallback paper label copy when no cover art is available", () => {
    render(<VinylRecord className="h-16 w-16" spinState={VinylSpinState.Idle} />);

    expect(screen.getByLabelText("Vinyl record")).toHaveAttribute("data-spin-state", VinylSpinState.Idle);
    expect(screen.getByText("music cloud")).toBeInTheDocument();
    expect(screen.getByText("33 1/3 RPM")).toBeInTheDocument();
  });

  it("renders the accepted mockup surface layers with a default homogeneous SIDE A print in the lower third", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelArtworkUrl="/covers/kind-of-blue.jpg"
        labelCatalogText="STEREO MC-1959"
        labelSubtitle="Miles Davis"
        labelTitle="Kind of Blue"
        labelYear="1959"
        spinState={VinylSpinState.Idle}
      />,
    );

    expect(container.querySelector("[data-vinyl-ground-shadow='true']")).toBeInTheDocument();
    // The spiral groove ships as a rasterised SVG bitmap behind an <img>, so
    // spinning the rotor is a pure GPU transform, not a per-frame vector re-raster.
    const grooves = container.querySelector("[data-vinyl-grooves='true']");
    expect(grooves?.tagName.toLowerCase()).toBe("img");
    expect(decodeURIComponent(grooves?.getAttribute("src") ?? "")).toContain("<path");
    expect(decodeURIComponent(grooves?.getAttribute("src") ?? "")).toContain(vinylGrooveSpiralPath(72, 19, 49.5));
    expect(container.querySelector("[data-vinyl-reflection='true']")?.getAttribute("style")).toContain(
      "conic-gradient(from 292deg",
    );
    expect(container.querySelector("[data-vinyl-label='true']")).toHaveClass("inset-[32%]");
    expect(container.querySelector("[data-vinyl-label-artwork='true']")).toHaveClass(
      "left-1/2",
      "top-1/2",
      "h-[112%]",
      "w-[112%]",
      "-translate-x-1/2",
      "-translate-y-1/2",
    );
    expect(container.querySelector("[data-vinyl-label-print='true']")).toHaveStyle({
      background: "rgb(5, 5, 6)",
      borderRadius: "0px",
    });
    expect(container.querySelector("[data-vinyl-label-title='true']")?.getAttribute("style")).toContain("Iosevka");
    expect(screen.getByText("SIDE A")).toBeInTheDocument();
    expect(screen.getByText("STEREO")).toBeInTheDocument();
    expect(screen.getByText("GEMA")).toBeInTheDocument();
    expect(screen.getByText("DMM")).toBeInTheDocument();
  });

  it("renders the resolved SIDE B letter and its dynamic pause-groove bitmap", () => {
    const sideLayout = {
      label: "B",
      tracks: [
        { durationMs: 185_000, position: "B1", title: "First groove" },
        { durationMs: 227_000, position: "B2", title: "Second groove" },
      ],
    };
    const { container } = render(<VinylRecord className="h-24 w-24" sideLayout={sideLayout} />);

    const grooves = container.querySelector("[data-vinyl-grooves='true']");
    const grooveBitmap = decodeURIComponent(grooves?.getAttribute("src") ?? "");

    expect(screen.getByText("SIDE B")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-label-side-letter='true']")).toHaveTextContent("B");
    expect(grooveBitmap).toContain(vinylSideGroovePath(sideLayout, { innerRadius: 19, outerRadius: 49.5, turns: 72 }));
    expect(grooveBitmap).toContain("stroke='rgba(0,0,0,0.72)' stroke-width='1.0'");
    expect(grooveBitmap).not.toContain(vinylGrooveSpiralPath(45, 19, 49.5));
  });

  it("shrinks long lower label titles to fit the round print arc instead of clipping them", () => {
    const longTitle = "L'ESPRIT DES VAGUES ET DES MACHINES";
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelCatalogText="ISRC FR9W11806223"
        labelSubtitle="Aorlhac"
        labelTitle={longTitle}
        spinState={VinylSpinState.Idle}
      />,
    );

    const titleArc = container.querySelector("[data-vinyl-label-title-arc='true']");
    const titleText = container.querySelector("[data-vinyl-label-title='true']");

    expect(titleArc).toHaveTextContent(longTitle);
    expect(titleArc?.tagName.toLowerCase()).toBe("textpath");
    // textLength/lengthAdjust are dropped: Safari and Firefox render them
    // inconsistently on textPath. The fit is done by shrinking the (monospace)
    // font size so the whole title stays on the arc.
    expect(titleArc).not.toHaveAttribute("textLength");
    expect(titleArc).not.toHaveAttribute("lengthAdjust");
    expect(Number(titleText?.getAttribute("font-size"))).toBeLessThan(4.3);
    expect(Number(titleText?.getAttribute("font-size"))).toBeGreaterThan(0);
    expect(container.querySelector("[data-vinyl-label-title-path='true']")).toHaveAttribute(
      "d",
      "M 12.5 73 A 44 44 0 0 0 87.5 73",
    );
    expect(titleText?.getAttribute("class") ?? "").not.toContain("truncate");
  });

  it("renders a medium lower label title at full size inside the centered print arc", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelCatalogText="ISRC FR9W11806223"
        labelSubtitle="Aorlhac"
        labelTitle="L'esprit des vents"
        labelYear="2018"
        spinState={VinylSpinState.Idle}
      />,
    );

    const titleArc = container.querySelector("[data-vinyl-label-title-arc='true']");

    expect(titleArc).toHaveTextContent("L'esprit des vents");
    expect(titleArc).not.toHaveAttribute("textLength");
    expect(titleArc).not.toHaveAttribute("lengthAdjust");
    // 18 monospace chars still fit the arc, so the title stays at the max size.
    expect(container.querySelector("[data-vinyl-label-title='true']")).toHaveAttribute("font-size", "4.3");
    expect(container.querySelector("[data-vinyl-label-subtitle-path='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-label-subtitle='true']")).toHaveAttribute("x", "50");
    expect(container.querySelector("[data-vinyl-label-subtitle='true']")).toHaveAttribute("text-anchor", "middle");
  });

  it("places the upper print fields on separate left center and right anchors", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelCatalogText="ISRC FR9W11806223"
        labelTitle="Rit des Vents"
        spinState={VinylSpinState.Idle}
      />,
    );

    expect(container.querySelector("[data-vinyl-label-gema='true']")).toHaveAttribute("x", "8");
    expect(container.querySelector("[data-vinyl-label-catalog='true']")).toHaveAttribute("x", "50");
    expect(container.querySelector("[data-vinyl-label-catalog='true']")).toHaveAttribute("text-anchor", "middle");
    expect(container.querySelector("[data-vinyl-label-catalog='true']")).not.toHaveAttribute("textLength");
    expect(container.querySelector("[data-vinyl-label-tech='true']")).toHaveAttribute("x", "92");
    expect(container.querySelector("[data-vinyl-label-tech='true']")).toHaveAttribute("text-anchor", "end");
  });

  it("shows the CC licence in the rights field (replacing GEMA) and leaves the catalog empty", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        labelRightsText="CC BY-NC-SA 3.0"
        labelTitle="Some CC Track"
        spinState={VinylSpinState.Idle}
      />,
    );

    expect(container.querySelector("[data-vinyl-label-gema='true']")).toHaveTextContent("CC BY-NC-SA 3.0");
    expect(screen.queryByText("GEMA")).not.toBeInTheDocument();
    // CC tracks are GEMA-free and have no ISRC, so the center catalog stays empty
    // (no "MC-…" placeholder) — the licence lives in the top-left rights field.
    expect(container.querySelector("[data-vinyl-label-catalog='true']")?.textContent).toBe("");
  });

  it("keeps short lower label titles naturally centered instead of stretching them", () => {
    const { container } = render(
      <VinylRecord className="h-24 w-24" labelSubtitle="Sombr" labelTitle="12 to 12" spinState={VinylSpinState.Idle} />,
    );

    const titleArc = container.querySelector("[data-vinyl-label-title-arc='true']");

    expect(titleArc).toHaveTextContent("12 to 12");
    expect(titleArc).not.toHaveAttribute("textLength");
    expect(container.querySelector("[data-vinyl-label-title-path='true']")).toHaveAttribute(
      "d",
      "M 12.5 73 A 44 44 0 0 0 87.5 73",
    );
    expect(container.querySelector("[data-vinyl-label-subtitle-path='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-label-subtitle='true']")).toHaveAttribute("x", "50");
    expect(container.querySelector("[data-vinyl-label-subtitle='true']")).toHaveAttribute("text-anchor", "middle");
    expect(container.querySelector("[data-vinyl-label-legal-path='true']")).toHaveAttribute(
      "d",
      "M 22 89 A 48 48 0 0 0 78 89",
    );
  });

  it("starts real LP rotation with WAAPI and coasts from the current angle", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    const { container, rerender } = render(
      <VinylRecord className="h-24 w-24" labelTitle="Kind of Blue" spinState={VinylSpinState.Playing} />,
    );

    expect(animate).toHaveBeenCalledWith(
      [{ transform: "rotate(0deg) translateZ(0.01px)" }, { transform: "rotate(360deg) translateZ(0.01px)" }],
      { duration: 1800, easing: "linear", iterations: Infinity },
    );

    const rotor = container.querySelector("[data-vinyl-rotor='true']") as HTMLElement;
    // The browser reports the live angle; we feed back the same transform we write.
    rotor.style.transform = "rotate(90deg) translateZ(0.01px)";

    rerender(<VinylRecord className="h-24 w-24" labelTitle="Kind of Blue" spinState={VinylSpinState.Coasting} />);

    expect(animate).toHaveBeenLastCalledWith(
      [{ transform: "rotate(90deg) translateZ(0.01px)" }, { transform: "rotate(290deg) translateZ(0.01px)" }],
      { duration: 2000, easing: "cubic-bezier(0.1, 0.2, 0.3, 1)", fill: "forwards" },
    );
  });

  it("commits the live transform before cancelling on handoff (prevents the Firefox compositor flash)", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    const { rerender } = render(
      <VinylRecord className="h-24 w-24" labelTitle="Kind of Blue" spinState={VinylSpinState.Playing} />,
    );

    // On the play -> coast handoff the running animation must flush its live value
    // into the inline style (commitStyles) BEFORE cancel(); otherwise Firefox
    // paints the base transform for a frame and the angle visibly jumps.
    rerender(<VinylRecord className="h-24 w-24" labelTitle="Kind of Blue" spinState={VinylSpinState.Coasting} />);

    expect(commitStyles).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(commitStyles.mock.invocationCallOrder[0]).toBeLessThan(cancel.mock.invocationCallOrder[0]);
  });

  it("loops at the fixed 1800 ms revolution while playing", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    render(<VinylRecord className="h-24 w-24" labelTitle="Kind of Blue" spinState={VinylSpinState.Playing} />);

    // The deck runs at a single fixed speed: one 1800 ms revolution, looped.
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), {
      duration: 1800,
      easing: "linear",
      iterations: Infinity,
    });
  });
});
