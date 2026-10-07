import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollapsibleHeight } from "@/components/ui/CollapsibleHeight";
import { MotionDuration } from "@/lib/motion/constants";
import { MC_OUT_CSS_EASING } from "@/lib/motion/setup";

/** jsdom has no Web Animations; this records the calls and hands back a stand-in. */
function stubAnimate() {
  const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation);
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animate });
  return animate;
}

/** Resolves after the next animation frame, which is when the region counts as painted. */
function nextFrame(): Promise<void> {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

function renderRegion(expanded: boolean) {
  return render(
    <CollapsibleHeight id="details" expanded={expanded}>
      <p>Genres</p>
    </CollapsibleHeight>,
  );
}

let animate: ReturnType<typeof stubAnimate>;

beforeEach(() => {
  animate = stubAnimate();
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CollapsibleHeight", () => {
  /** The frame of the click only changes a height, so the content is there before it is asked for. */
  it("keeps the content mounted while collapsed, out of reach and at height 0", () => {
    const { container } = renderRegion(false);
    const region = container.querySelector("#details") as HTMLElement;

    expect(screen.getByText("Genres")).toBeInTheDocument();
    expect(region.style.height).toBe("0px");
    expect(region).toHaveAttribute("inert");
  });

  it("opens on the browser's animation timeline to the content's height", async () => {
    const { container, rerender } = renderRegion(false);
    const region = container.querySelector("#details") as HTMLElement;
    vi.spyOn(region, "scrollHeight", "get").mockReturnValue(240);
    await nextFrame();

    rerender(
      <CollapsibleHeight id="details" expanded>
        <p>Genres</p>
      </CollapsibleHeight>,
    );

    expect(animate).toHaveBeenCalledWith([{ height: "0px" }, { height: "240px" }], {
      duration: MotionDuration.Collapse * 1000,
      easing: MC_OUT_CSS_EASING,
    });
    expect(region.style.height).toBe("auto");
    expect(region).not.toHaveAttribute("inert");
  });

  it("closes from the height it shows to 0", async () => {
    const { container, rerender } = renderRegion(true);
    const region = container.querySelector("#details") as HTMLElement;
    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({ height: 180 } as DOMRect);
    await nextFrame();

    rerender(
      <CollapsibleHeight id="details" expanded={false}>
        <p>Genres</p>
      </CollapsibleHeight>,
    );

    expect(animate).toHaveBeenCalledWith([{ height: "180px" }, { height: "0px" }], expect.any(Object));
    expect(region.style.height).toBe("0px");
  });

  it("lands a state restored before the first paint without an animation", () => {
    const { container, rerender } = renderRegion(false);
    rerender(
      <CollapsibleHeight id="details" expanded>
        <p>Genres</p>
      </CollapsibleHeight>,
    );

    expect(animate).not.toHaveBeenCalled();
    expect((container.querySelector("#details") as HTMLElement).style.height).toBe("auto");
  });

  it("lands in the end state without an animation under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    const { rerender } = renderRegion(false);
    await nextFrame();

    rerender(
      <CollapsibleHeight id="details" expanded>
        <p>Genres</p>
      </CollapsibleHeight>,
    );

    expect(animate).not.toHaveBeenCalled();
  });
});
