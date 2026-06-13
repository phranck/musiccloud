import { act, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";

/**
 * Component-wiring contract of `CollapsibleSection` on top of the
 * `lib/motion/collapse.ts` factories (whose tween mechanics are covered by
 * `collapse.test.ts`). Asserted here is the component's own state logic:
 * the open/close transition detection (`wasOpenRef`), the fresh-vs-resume
 * detection (`hadChildrenRef` → seeded collapsed start values only on a
 * fresh expand), the children snapshot that keeps old content mounted while
 * a collapse plays and unmounts it from the timeline's `onCollapsed`, and
 * the synchronous instant path for `disableMobileCollapse` on mobile
 * viewports.
 *
 * jsdom + deterministic settling: timelines are driven via `totalProgress`
 * inside `act` (no ticker time). Tween presence is asserted via
 * `gsap.getTweensOf` — never `isActive()`, which keeps reporting `true`
 * after `kill()` (GSAP API quirk, established in `swap.test.ts`).
 */

/** Marker rendered as section content so DOM presence is queryable. */
const CONTENT_TEST_ID = "section-content";

/** Mid-flight progress for the reversal fixture. */
const MID_FLIGHT_PROGRESS = 0.5;

/**
 * Installs a `window.matchMedia` stub discriminating the two queries the
 * component path reads: the viewport query of `disableMobileCollapse`
 * (contains "width") reports `mobileViewport`, the reduced-motion query
 * reports `false` (animations enabled — the factories' reduced gate is
 * covered by `collapse.test.ts`). jsdom does not implement `matchMedia`, so
 * a plain stub is required.
 */
function stubMatchMedia({ mobileViewport = false }: { mobileViewport?: boolean } = {}): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("width") ? mobileViewport : false,
          media: query,
        }) as MediaQueryList,
    ),
  );
}

/** Renders the section the way consumers do: children are nulled together with `visible`. */
function renderSection(visible: boolean) {
  return render(
    <CollapsibleSection visible={visible} sectionClass="p-3">
      {visible && <div data-testid={CONTENT_TEST_ID} />}
    </CollapsibleSection>,
  );
}

/** Re-renders with the consumer pattern (children follow `visible`). */
function rerenderSection(rerender: ReturnType<typeof render>["rerender"], visible: boolean): void {
  rerender(
    <CollapsibleSection visible={visible} sectionClass="p-3">
      {visible && <div data-testid={CONTENT_TEST_ID} />}
    </CollapsibleSection>,
  );
}

/** Completes every in-flight GSAP animation, firing onComplete handlers inside `act`. */
function settleAllAnimations(): void {
  act(() => {
    gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.totalProgress(1));
  });
}

/** Drives the factory-built (top-level) timelines to a mid-flight progress. */
function driveTimelinesTo(progress: number): void {
  act(() => {
    gsap.globalTimeline.getChildren(false, false, true).forEach((timeline) => timeline.totalProgress(progress));
  });
}

beforeEach(() => {
  stubMatchMedia();
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
});

describe("CollapsibleSection wiring", () => {
  it("keeps children mounted during a collapse and unmounts them when the timeline completes", () => {
    const { container, rerender } = renderSection(true);
    const shell = container.firstElementChild as HTMLElement;
    // Settled-open first mount: no entrance animation (open/close detection
    // must not fire without a transition).
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();
    expect(gsap.getTweensOf(shell)).toHaveLength(0);

    rerenderSection(rerender, false);

    // Collapse in flight: the snapshot keeps the old content visible even
    // though the consumer already nulled its children, and the shell carries
    // the fade tween.
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();
    expect(gsap.getTweensOf(shell).length).toBeGreaterThan(0);

    settleAllAnimations();

    // onCollapsed unmounted the snapshot (the setTimeout replacement).
    expect(screen.queryByTestId(CONTENT_TEST_ID)).toBeNull();
  });

  it("reverses a mid-flight collapse into an expand without stranding the children", () => {
    const { container, rerender } = renderSection(true);
    const shell = container.firstElementChild as HTMLElement;

    rerenderSection(rerender, false);
    driveTimelinesTo(MID_FLIGHT_PROGRESS);
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();

    rerenderSection(rerender, true);

    // The expand killed the collapse predecessor (exactly one driver left on
    // the shell) and resumed — the superseded onCollapsed must never fire.
    expect(gsap.getTweensOf(shell)).toHaveLength(1);
    const curtain = shell.firstElementChild as HTMLElement;
    // Resume, not a fresh expand: no snap back to the seeded -100% start.
    expect(gsap.getProperty(curtain, "yPercent") as number).toBeGreaterThan(-100);

    settleAllAnimations();

    // Children survived the reversal and the section settled clean.
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();
    expect(shell.style.opacity).toBe("");
    expect(curtain.style.transform).toBe("");
  });

  it("expands fresh from settled-closed with the seeded collapsed start values", () => {
    const { container, rerender } = renderSection(false);
    const shell = container.firstElementChild as HTMLElement;
    expect(screen.queryByTestId(CONTENT_TEST_ID)).toBeNull();

    rerenderSection(rerender, true);

    // Children mounted in the same commit; the fresh-expand detection seeded
    // the closed start state pre-paint (curtain raised, shell hidden).
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();
    const curtain = shell.firstElementChild as HTMLElement;
    expect(gsap.getProperty(curtain, "yPercent") as number).toBeCloseTo(-100);
    expect(gsap.getProperty(shell, "opacity") as number).toBe(0);

    settleAllAnimations();

    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();
    expect(shell.style.opacity).toBe("");
  });

  it("closes synchronously without a timeline on mobile viewports with disableMobileCollapse", () => {
    stubMatchMedia({ mobileViewport: true });
    const { container, rerender } = render(
      <CollapsibleSection visible disableMobileCollapse sectionClass="p-3">
        <div data-testid={CONTENT_TEST_ID} />
      </CollapsibleSection>,
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(screen.getByTestId(CONTENT_TEST_ID)).toBeInTheDocument();

    rerender(
      <CollapsibleSection visible={false} disableMobileCollapse sectionClass="p-3">
        {false}
      </CollapsibleSection>,
    );

    // Instant path: unmounted in the same commit, no timeline was built.
    expect(screen.queryByTestId(CONTENT_TEST_ID)).toBeNull();
    expect(gsap.getTweensOf(shell)).toHaveLength(0);
  });
});
