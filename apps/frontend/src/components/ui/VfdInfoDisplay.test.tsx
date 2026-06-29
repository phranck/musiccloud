import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VfdDisplayLine, VfdDisplayProps } from "@/components/ui/VfdDisplayTypes";

/**
 * VfdInfoDisplay composes the generic `VfdDisplay` into the fixed four-row
 * track-info layout. `VfdDisplay` renders onto a canvas (no DOM text), so the
 * line model is the testable surface: the mock captures the props handed to
 * `VfdDisplay` and the assertions inspect the resulting `lines`/`ariaLabel`.
 */

const capturedProps = vi.hoisted(() => ({ current: null as VfdDisplayProps | null }));

vi.mock("@/components/ui/VfdDisplay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/VfdDisplay")>();
  return {
    ...actual,
    VfdDisplay: (props: VfdDisplayProps) => {
      capturedProps.current = props;
      return null;
    },
  };
});

import { VfdInfoDisplay } from "@/components/ui/VfdInfoDisplay";

/** Returns the line model handed to the mocked `VfdDisplay` on the last render. */
function lastLines(): VfdDisplayLine[] {
  const props = capturedProps.current;
  if (!props) throw new Error("VfdDisplay was not rendered");
  return props.lines;
}

describe("VfdInfoDisplay", () => {
  it("builds four rows for title/meta, artist, detail and status", () => {
    render(
      <VfdInfoDisplay
        title="Blue Train"
        artist="John Coltrane"
        detailLine="Blue Train · E"
        metaLine="6:45 · 1958"
        statusLine="READY"
      />,
    );

    const lines = lastLines();
    expect(lines).toHaveLength(4);
    // Row 1: title + right-pinned meta as two sections.
    expect(lines[0].sections).toHaveLength(2);
    expect(lines[0].sections?.[0].content).toBe("Blue Train");
    expect(lines[0].sections?.[1].content).toBe(" 6:45 · 1958");
    // Rows 2-4 carry the artist, detail and status strings directly.
    expect(lines[1].content).toBe("John Coltrane");
    expect(lines[2].content).toBe("Blue Train · E");
    expect(lines[3].content).toBe("READY");
    expect(capturedProps.current?.ariaLabel).toBe("Track information: Blue Train John Coltrane Blue Train · E READY");
  });

  it("renders the title as a single full-width section when meta is empty", () => {
    render(<VfdInfoDisplay title="Solo" artist="Artist" detailLine="" metaLine="" statusLine="READY" />);

    const lines = lastLines();
    expect(lines[0].sections).toHaveLength(1);
    expect(lines[0].sections?.[0].content).toBe("Solo");
  });

  it("does not marquee a short status but does past 28 characters", () => {
    render(<VfdInfoDisplay title="T" artist="A" detailLine="D" metaLine="" statusLine="READY" />);
    expect(lastLines()[3].marquee).toBe(false);

    const longStatus = "Paused while the buffer fills up";
    expect(longStatus.length).toBeGreaterThan(28);
    render(<VfdInfoDisplay title="T" artist="A" detailLine="D" metaLine="" statusLine={longStatus} />);
    expect(lastLines()[3].marquee).toBe(true);
  });

  it("sets the status scroll-out overlay text from the seek hint", () => {
    render(
      <VfdInfoDisplay
        title="T"
        artist="A"
        detailLine="D"
        metaLine=""
        statusLine="READY"
        seekHint={{ direction: "right", nonce: 3 }}
      />,
    );

    const overlay = lastLines()[3].scrollOutOverlay;
    expect(overlay).toMatchObject({ text: "10s >>", direction: "right", nonce: 3 });
  });

  it("leaves the status overlay unset without a seek hint", () => {
    render(<VfdInfoDisplay title="T" artist="A" detailLine="D" metaLine="" statusLine="READY" />);
    expect(lastLines()[3].scrollOutOverlay).toBeUndefined();
  });
});
