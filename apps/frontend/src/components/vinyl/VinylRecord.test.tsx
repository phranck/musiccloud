import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NIGHT_SKY_DEFAULTS } from "@/components/background/nightSky/settings";
import { VinylRecord } from "@/components/vinyl/VinylRecord";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { labelArcPath, vinylGrooveSpiralPath, vinylSideGroovePath } from "@/lib/media/vinyl-geometry";

const originalAnimate = HTMLElement.prototype.animate;

afterEach(() => {
  if (originalAnimate) {
    HTMLElement.prototype.animate = originalAnimate;
  } else {
    // jsdom does not implement WAAPI by default.
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("VinylRecord", () => {
  it("renders a circular record with cover art on the paper label and the requested spin state", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
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

  it("renders the Generic label on the compact Single when no cover art is available", () => {
    const { container } = render(
      <VinylRecord className="h-16 w-16" discFormat="single" spinState={VinylSpinState.Idle} />,
    );

    expect(screen.getByLabelText("Vinyl record")).toHaveAttribute("data-vinyl-disc-format", "single");
    expect(container.querySelector("[data-vinyl-label-variant='generic']")).toBeInTheDocument();
    expect(container.querySelector("img[data-vinyl-grooves='true']")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml,/),
    );
  });

  it("renders the Generic label with a cloudy production day sky and a flat near-black lower half", () => {
    const { container } = render(
      <VinylRecord
        className="h-16 w-16"
        discFormat="single"
        labelVariant="generic"
        spinState={VinylSpinState.Playing}
      />,
    );

    expect(container.querySelector("svg[data-vinyl-generic-label='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-clouds='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-night-sky='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-cyan-ring='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-wordmark='true']")).toHaveTextContent("musiccloud");
    expect(container.querySelector("[data-vinyl-generic-imprint='true']")).toHaveTextContent(
      "LIMITED SPATIAL AUDIO EDITION",
    );
    expect(
      Array.from(container.querySelectorAll("[data-vinyl-generic-day-gradient='true'] stop"), (stop) =>
        stop.getAttribute("stop-color"),
      ),
    ).toEqual([NIGHT_SKY_DEFAULTS.skyTopDay, NIGHT_SKY_DEFAULTS.skyBottomDay]);
    expect(container.querySelector("[data-vinyl-generic-night-gradient='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-night-sky='true']")).toHaveAttribute("fill", "#030405");
    expect(container.querySelector("[data-vinyl-generic-stars='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-catalog-star='true']")).not.toBeInTheDocument();
    expect(container.querySelectorAll("[data-vinyl-generic-clouds='true'] ellipse")).toHaveLength(0);
    expect(container.querySelector("[data-vinyl-generic-cloud-layer='true']")).toHaveAttribute("opacity", "1");
    expect(container.querySelector("[data-vinyl-generic-cloud-noise='true']")).toHaveAttribute(
      "baseFrequency",
      "0.011 0.022",
    );
    expect(container.querySelector("[data-vinyl-generic-cloud-noise='true']")).toHaveAttribute("numOctaves", "4");
    expect(container.querySelector("[data-vinyl-generic-cloud-coverage='true']")).toHaveAttribute(
      "tableValues",
      "0 0 0 0.03 0.14 0.38 0.7 0.94 1 1",
    );
    expect(container.querySelector("[data-vinyl-generic-cloud-shadow='true']")).toHaveAttribute(
      "flood-color",
      "#3f6073",
    );
    expect(container.querySelector("[data-vinyl-generic-cloud-shadow='true']")).toHaveAttribute(
      "flood-opacity",
      "0.95",
    );
    expect(container.querySelector("[data-vinyl-generic-cloud-shadow-offset='true']")).toHaveAttribute("dy", "1.2");
    expect(container.querySelector("svg[data-vinyl-generic-label='true'] line")).not.toBeInTheDocument();
    expect(
      Array.from(container.querySelectorAll("[data-vinyl-generic-wordmark-gradient='true'] stop"), (stop) =>
        stop.getAttribute("stop-color"),
      ),
    ).toEqual(["#ff6699", "#9966ff", "#4d99ff", "#00cce6", "#00e6b3", "#80e64d", "#e6e64d", "#ffb34d"]);
    expect(container.querySelector("[data-vinyl-generic-wordmark-gradient='true']")).toHaveAttribute(
      "gradientUnits",
      "objectBoundingBox",
    );
    expect(container.querySelector("[data-vinyl-generic-wordmark-gradient='true']")).toHaveAttribute("x1", "0%");
    expect(container.querySelector("[data-vinyl-generic-wordmark-gradient='true']")).toHaveAttribute("x2", "100%");
    expect(container.querySelector("[data-vinyl-generic-wordmark='true']")).not.toHaveAttribute("filter");
    expect(container.querySelector("[data-vinyl-generic-wordmark='true']")).toHaveAttribute("font-size", "8.55");
    expect(container.querySelector("[data-vinyl-generic-wordmark='true']")).toHaveAttribute("letter-spacing", "1.35");
    expect(container.querySelector("[data-vinyl-generic-imprint-path='true']")).toHaveAttribute(
      "d",
      labelArcPath(34.5, 78),
    );
    expect(container.querySelector("div[data-vinyl-reflection='true']")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-label-print='true']")).not.toBeInTheDocument();
  });

  it("renders the current year on the upper Day arc and keeps the lower wordmark alone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-07-13T12:00:00Z"));

    const { container } = render(
      <VinylRecord className="h-24 w-24" discFormat="lp" labelVariant="generic" spinState={VinylSpinState.Idle} />,
    );

    const wordmarkArc = container.querySelector<SVGPathElement>("[data-vinyl-generic-wordmark-path='true']");
    const wordmarkPath = container.querySelector("[data-vinyl-generic-wordmark='true'] textPath");
    const copyrightArc = container.querySelector<SVGPathElement>("[data-vinyl-generic-copyright-path='true']");
    const copyrightText = container.querySelector<SVGTextElement>("[data-vinyl-generic-copyright='true']");
    const copyrightTextPath = copyrightText?.querySelector("textPath");

    expect(wordmarkArc).toHaveAttribute("d", labelArcPath(46, 83));
    expect(wordmarkPath).toHaveAttribute("href", `#${wordmarkArc?.id}`);
    expect(copyrightArc).toHaveAttribute("d", "M 4 50 A 46 46 0 0 1 96 50");
    expect(copyrightText).toHaveTextContent(
      "Copyright 2031 • Proudly crafted and presented by musiccloud in Bregenz at Lake Constance in Austria",
    );
    expect(copyrightText).toHaveAttribute("fill", "#000000");
    expect(copyrightText).toHaveAttribute("font-size", "2.15");
    expect(copyrightText).toHaveAttribute("letter-spacing", "0.28");
    expect(copyrightTextPath).toHaveAttribute("href", `#${copyrightArc?.id}`);
    expect(copyrightTextPath).toHaveAttribute("startOffset", "50%");
    expect(copyrightTextPath).toHaveAttribute("text-anchor", "middle");
    expect(container.querySelector("[data-vinyl-generic-copyright-brand='true']")).toHaveTextContent("musiccloud");
    expect(container.querySelector("[data-vinyl-generic-copyright-brand='true']")).toHaveAttribute(
      "font-weight",
      "700",
    );
    expect(container.querySelector("[data-vinyl-generic-presented-by='true']")).not.toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-generic-location='true']")).not.toBeInTheDocument();
  });

  it("reuses the live LP pressing copy with a Generic-only lower-row offset and wider spacing", () => {
    const generic = render(
      <VinylRecord className="h-24 w-24" discFormat="lp" labelVariant="generic" spinState={VinylSpinState.Idle} />,
    );
    const standard = render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelArtworkUrl="/covers/kind-of-blue.jpg"
        labelCatalogText="MC-GSP-001"
        labelVariant="standard"
        spinState={VinylSpinState.Idle}
      />,
    );

    const genericWrapper = generic.container.querySelector<SVGGElement>("[data-vinyl-generic-pressing-copy='true']");
    const genericCopy = generic.container.querySelector<SVGGElement>("[data-vinyl-label-pressing-copy='true']");
    const standardCopy = standard.container.querySelector<SVGGElement>("[data-vinyl-label-pressing-copy='true']");
    const genericLowerCopy = genericCopy?.querySelector<SVGGElement>("[data-vinyl-label-lower-copy='true']");
    const standardLowerCopy = standardCopy?.querySelector<SVGGElement>("[data-vinyl-label-lower-copy='true']");

    expect(genericWrapper).toContainElement(genericCopy);
    expect(genericWrapper).toHaveAttribute("transform", "translate(0 -8)");
    expect(genericCopy).toBeInTheDocument();
    expect(genericLowerCopy).toHaveAttribute("transform", "translate(0 3)");
    expect(standardLowerCopy).not.toHaveAttribute("transform");
    expect(genericCopy?.querySelector("[data-vinyl-label-gema='true']")).toHaveAttribute("x", "8");
    expect(genericCopy?.querySelector("[data-vinyl-label-gema='true']")).toHaveAttribute("y", "65");
    expect(standardCopy?.querySelector("[data-vinyl-label-gema='true']")).toHaveAttribute("y", "65");
    expect(genericCopy?.querySelector("[data-vinyl-label-side='true']")).toHaveAttribute("x", "32");
    expect(genericCopy?.querySelector("[data-vinyl-label-side-letter='true']")).toHaveAttribute("x", "32");
    expect(genericCopy?.querySelector("[data-vinyl-label-side-letter='true']")).toHaveAttribute("y", "75");
    expect(genericCopy?.querySelector("[data-vinyl-label-stereo='true']")).toHaveAttribute("x", "68");
    expect(genericCopy?.querySelector("[data-vinyl-label-stereo='true']")).toHaveAttribute("font-size", "10.2");
    expect(standardCopy?.querySelector("[data-vinyl-label-side='true']")).toHaveAttribute("x", "38");
    expect(standardCopy?.querySelector("[data-vinyl-label-side-letter='true']")).toHaveAttribute("x", "38");
    expect(standardCopy?.querySelector("[data-vinyl-label-stereo='true']")).toHaveAttribute("x", "60");
  });

  it("renders the original procedural SVG LP body with a separate standard paper label", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelArtworkUrl="/covers/kind-of-blue.jpg"
        labelCatalogText="STEREO MC-1959"
        labelSubtitle="Miles Davis"
        labelTitle="Kind of Blue"
        labelYear="1959"
        spinState={VinylSpinState.Idle}
      />,
    );

    expect(container.querySelector("[data-vinyl-ground-shadow='true']")).toBeInTheDocument();
    expect(container.querySelector("img[data-vinyl-grooves='true']")).toHaveAttribute(
      "src",
      expect.stringMatching(/^data:image\/svg\+xml,/),
    );
    expect(container.querySelector("[data-vinyl-base='true']")).not.toBeInTheDocument();
    const reflection = container.querySelector<HTMLDivElement>("div[data-vinyl-reflection='true']");
    expect(reflection).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-rotor='true']")).not.toContainElement(reflection);
    expect(container.querySelector("[data-vinyl-label='true']")).toHaveStyle({ inset: "32%" });
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

  it("restores the original live SVG groove recipe and adds exactly two unequal track pauses", () => {
    const { container } = render(<VinylRecord className="h-24 w-24" discFormat="lp" />);

    const surface = container.querySelector<HTMLElement>("[data-vinyl-surface='true']");
    const grooves = container.querySelector("img[data-vinyl-grooves='true']");
    const reflection = container.querySelector<HTMLElement>("div[data-vinyl-reflection='true']");
    const svgSource = decodeURIComponent(grooves?.getAttribute("src") ?? "");

    expect(surface?.style.backgroundImage).toContain("repeating-conic-gradient");
    expect(svgSource).toContain(vinylGrooveSpiralPath(72, 19, 49.5));
    expect(svgSource).toContain("stroke='rgba(0,0,0,0.5)' stroke-width='0.34'");
    expect(svgSource).toContain("stroke='rgba(255,255,255,0.06)' stroke-width='0.14'");
    expect(svgSource.match(/<circle /g)).toHaveLength(2);
    expect(svgSource).toContain("r='41.6'");
    expect(svgSource).toContain("r='28.5'");
    expect(svgSource.match(/stroke='rgba\(0,0,0,0\.34\)' stroke-width='0\.6'/g)).toHaveLength(2);
    expect(svgSource.indexOf("<path")).toBeGreaterThan(svgSource.lastIndexOf("<circle"));
    expect(svgSource).not.toContain("feTurbulence");
    expect(reflection?.style.backgroundImage).toContain("conic-gradient(from 292deg");
    expect(reflection?.style.maskImage).toContain("rgba(0, 0, 0, 0.5) 39.8% 40.7%");
    expect(reflection?.style.maskImage).toContain("rgba(0, 0, 0, 0.5) 58.4% 59.2%");
    expect(reflection?.style.maskImage).not.toContain("transparent 39.8% 40.7%");
    expect(container.querySelector("[data-vinyl-rotor='true']")).not.toContainElement(reflection);
  });

  it("uses the same restored SVG record surface for the compact Single", () => {
    const lp = render(<VinylRecord className="h-24 w-24" discFormat="lp" />);
    const single = render(<VinylRecord className="h-16 w-16" discFormat="single" />);

    const lpGrooves = lp.container.querySelector("img[data-vinyl-grooves='true']");
    const singleGrooves = single.container.querySelector("img[data-vinyl-grooves='true']");
    const svgSource = decodeURIComponent(singleGrooves?.getAttribute("src") ?? "");

    expect(singleGrooves).toHaveAttribute("src", lpGrooves?.getAttribute("src"));
    expect(svgSource).toContain(vinylGrooveSpiralPath(72, 19, 49.5));
    expect(svgSource.match(/<circle /g)).toHaveLength(2);
    expect(single.container.querySelector("[data-vinyl-label='true']")).toHaveStyle({ inset: "23%" });
    expect(single.container.querySelector("[data-vinyl-single-adapter-recess='true']")).not.toBeInTheDocument();
    expect(lp.container.querySelector<HTMLElement>("[data-vinyl-reflection='true']")?.style.maskImage).toContain(
      "transparent 0 28.0%, rgba(0, 0, 0, 0.72) 31.0%",
    );
    expect(single.container.querySelector<HTMLElement>("[data-vinyl-reflection='true']")?.style.maskImage).toContain(
      "transparent 0 40.7%, rgba(0, 0, 0, 0.72) 43.7%",
    );
  });

  it("renders the rendered-reference CNC 45 RPM adapter with a directionally lit outer chamfer", () => {
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="single"
        labelVariant="generic"
        spinState={VinylSpinState.Playing}
      />,
    );

    const rotor = container.querySelector<HTMLElement>("[data-vinyl-rotor='true']");
    const surface = container.querySelector<HTMLElement>("[data-vinyl-single-centre-opening='true']");
    const adapter = container.querySelector<HTMLElement>("[data-vinyl-single-rpm-adapter='true']");
    const outerChamfer = container.querySelector<HTMLElement>("[data-vinyl-single-rpm-adapter-outer-chamfer='true']");
    const face = container.querySelector<HTMLElement>("[data-vinyl-single-rpm-adapter-face='true']");
    const recessRim = container.querySelector<HTMLElement>("[data-vinyl-single-rpm-adapter-recess-rim='true']");
    const innerChamfer = container.querySelector<HTMLElement>("[data-vinyl-single-rpm-adapter-inner-chamfer='true']");

    expect(surface?.style.maskImage).toContain("transparent 0 15.2%, rgb(0, 0, 0) 15.5%");
    expect(adapter).toHaveStyle({ width: "23.2%" });
    expect(adapter?.style.maskImage).toContain("transparent 0 11.2%, rgb(0, 0, 0) 11.5%");
    expect(outerChamfer).toBeInTheDocument();
    expect(outerChamfer?.style.backgroundImage).toContain("conic-gradient(from 292deg");
    expect(outerChamfer?.style.backgroundImage).toContain("rgba(255, 255, 255, 0.58)");
    expect(outerChamfer?.style.backgroundImage).toContain("linear-gradient(135deg");
    expect(outerChamfer?.style.backgroundImage).not.toContain("#b9c7cc 53%");
    expect(outerChamfer?.style.maskImage).toContain("transparent 0 50.5%");
    expect(face).toHaveStyle({ inset: "14%" });
    expect(face?.style.maskImage).toContain("transparent 0 15.5%, rgb(0, 0, 0) 15.8%");
    expect(recessRim?.style.backgroundImage).toContain("linear-gradient(315deg");
    expect(recessRim?.style.backgroundImage).toContain("rgba(9, 27, 36, 0.76)");
    expect(recessRim?.style.maskImage).toContain("transparent 0 64%");
    expect(innerChamfer).toBeInTheDocument();
    expect(innerChamfer?.style.backgroundImage).toContain("linear-gradient(315deg");
    expect(innerChamfer?.style.backgroundImage).toContain("rgba(237, 247, 249, 0.88)");
    expect(innerChamfer?.style.backgroundImage).toContain("rgba(9, 27, 36, 0.76)");
    expect(innerChamfer?.style.boxShadow).toContain("rgba(238, 248, 250, 0.82)");
    expect(innerChamfer?.style.maskImage).toContain("transparent 0 15.5%, rgb(0, 0, 0) 15.8% 21.4%");
    expect(adapter).toContainElement(outerChamfer);
    expect(adapter).toContainElement(face);
    expect(face).toContainElement(recessRim);
    expect(face).toContainElement(innerChamfer);
    expect(rotor).not.toContainElement(adapter);
    expect(surface).toContainElement(rotor);
  });

  it("moves the Generic pressing copy clear of the Single's 45 RPM opening", () => {
    const { container } = render(
      <VinylRecord className="h-24 w-24" discFormat="single" labelVariant="generic" spinState={VinylSpinState.Idle} />,
    );

    expect(container.querySelector("[data-vinyl-label-catalog='true']")).toHaveAttribute("y", "34");
    expect(container.querySelector("[data-vinyl-label-side='true']")).toHaveAttribute("x", "18");
    expect(container.querySelector("[data-vinyl-label-stereo='true']")).toHaveAttribute("x", "84");
  });

  it("renders the resolved SIDE B letter and its dynamic pause-groove bitmap", () => {
    const sideLayout = {
      label: "B",
      tracks: [
        { durationMs: 185_000, position: "B1", title: "First groove" },
        { durationMs: 227_000, position: "B2", title: "Second groove" },
      ],
    };
    const { container } = render(
      <VinylRecord className="h-24 w-24" discFormat="lp" labelVariant="standard" sideLayout={sideLayout} />,
    );

    const grooves = container.querySelector("[data-vinyl-grooves='true']");
    const grooveBitmap = decodeURIComponent(grooves?.getAttribute("src") ?? "");

    expect(screen.getByText("SIDE B")).toBeInTheDocument();
    expect(container.querySelector("[data-vinyl-label-side-letter='true']")).toHaveTextContent("B");
    expect(grooveBitmap).toContain(vinylSideGroovePath(sideLayout, { innerRadius: 19, outerRadius: 49.5, turns: 72 }));
    expect(grooveBitmap).toContain("stroke='rgba(0,0,0,0.72)' stroke-width='1.0'");
    expect(container.querySelector("[data-vinyl-base='true']")).not.toBeInTheDocument();
    expect(container.querySelector<HTMLElement>("[data-vinyl-reflection='true']")?.style.maskImage).not.toContain(
      "rgba(0, 0, 0, 0.5) 39.8% 40.7%",
    );
  });

  it("shrinks long lower label titles to fit the round print arc instead of clipping them", () => {
    const longTitle = "L'ESPRIT DES VAGUES ET DES MACHINES";
    const { container } = render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelCatalogText="ISRC FR9W11806223"
        labelSubtitle="Aorlhac"
        labelTitle={longTitle}
        labelVariant="standard"
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
        discFormat="lp"
        labelCatalogText="ISRC FR9W11806223"
        labelSubtitle="Aorlhac"
        labelTitle="L'esprit des vents"
        labelYear="2018"
        labelVariant="standard"
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
        discFormat="lp"
        labelCatalogText="ISRC FR9W11806223"
        labelTitle="Rit des Vents"
        labelVariant="standard"
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
        discFormat="lp"
        labelRightsText="CC BY-NC-SA 3.0"
        labelTitle="Some CC Track"
        labelVariant="standard"
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
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelSubtitle="Sombr"
        labelTitle="12 to 12"
        labelVariant="standard"
        spinState={VinylSpinState.Idle}
      />,
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
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelTitle="Kind of Blue"
        spinState={VinylSpinState.Playing}
      />,
    );

    expect(animate).toHaveBeenCalledWith(
      [{ transform: "rotate(0deg) translateZ(0.01px)" }, { transform: "rotate(360deg) translateZ(0.01px)" }],
      { duration: 1800, easing: "linear", iterations: Infinity },
    );

    const rotor = container.querySelector("[data-vinyl-rotor='true']") as HTMLElement;
    // The browser reports the live angle; we feed back the same transform we write.
    rotor.style.transform = "rotate(90deg) translateZ(0.01px)";

    rerender(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelTitle="Kind of Blue"
        spinState={VinylSpinState.Coasting}
      />,
    );

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
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelTitle="Kind of Blue"
        spinState={VinylSpinState.Playing}
      />,
    );

    // On the play -> coast handoff the running animation must flush its live value
    // into the inline style (commitStyles) BEFORE cancel(); otherwise Firefox
    // paints the base transform for a frame and the angle visibly jumps.
    rerender(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelTitle="Kind of Blue"
        spinState={VinylSpinState.Coasting}
      />,
    );

    expect(commitStyles).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
    expect(commitStyles.mock.invocationCallOrder[0]).toBeLessThan(cancel.mock.invocationCallOrder[0]);
  });

  it("loops at the fixed 1800 ms revolution while playing", () => {
    const cancel = vi.fn();
    const commitStyles = vi.fn();
    const animate = vi.fn(() => ({ cancel, commitStyles })) as unknown as typeof HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = animate;

    render(
      <VinylRecord
        className="h-24 w-24"
        discFormat="lp"
        labelTitle="Kind of Blue"
        spinState={VinylSpinState.Playing}
      />,
    );

    // The deck runs at a single fixed speed: one 1800 ms revolution, looped.
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), {
      duration: 1800,
      easing: "linear",
      iterations: Infinity,
    });
  });
});
