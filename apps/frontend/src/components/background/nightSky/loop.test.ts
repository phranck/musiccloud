import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NightSkyDriver } from "./loop";
import { DAY_FADE_FPS, NIGHT_SKY_DEFAULTS } from "./settings";

/**
 * Contract of the shared frame driver (plan MC-029 Phase 4) — the ONE piece
 * of loop logic that runs identically inside the worker and in the
 * main-thread fallback: fps gating at the user's cap (10), the temporary
 * 30-fps lift while a manual day/night fade runs, the `animate`-off mode
 * (still image, zero draws unless something requests a repaint) and the
 * reduced-motion single-frame contract. Tested against a mock scene; the
 * GL side itself is browser-verified.
 */

function makeScene() {
  return { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
}

function makeDriver(overrides: Partial<typeof NIGHT_SKY_DEFAULTS> = {}) {
  const scene = makeScene();
  const driver = new NightSkyDriver(scene, { ...NIGHT_SKY_DEFAULTS, ...overrides });
  return { scene, driver };
}

describe("NightSkyDriver", () => {
  it("draws at most at the fps cap while animating", () => {
    const { scene, driver } = makeDriver({ fpsCap: 10 });
    driver.tick(0); // first frame always draws
    driver.tick(50); // 50 ms < 100 ms interval → gated
    driver.tick(105); // ≥ interval → draws
    driver.tick(140); // gated again
    expect(scene.draw).toHaveBeenCalledTimes(2);
  });

  it("renders one initial still frame with animate off, then only on request", () => {
    const { scene, driver } = makeDriver({ animate: 0 });
    driver.tick(0); // initial still image (a black canvas would be a bug)
    driver.tick(200);
    driver.tick(400);
    expect(scene.draw).toHaveBeenCalledTimes(1);

    driver.requestRedraw();
    driver.tick(600);
    driver.tick(800);
    expect(scene.draw).toHaveBeenCalledTimes(2);
  });

  it("redrawNow paints immediately, bypassing the fps gate, then re-anchors it", () => {
    const { scene, driver } = makeDriver({ fpsCap: 10 });
    driver.tick(0); // baseline draw anchors the gate at t=0
    scene.draw.mockClear();

    // A scheduled tick 20 ms later is gated (< 100 ms interval)…
    driver.tick(20);
    expect(scene.draw).not.toHaveBeenCalled();

    // …but a resize repaint must land in the SAME task: the cleared buffer
    // would otherwise flash opaque-black until the next gated tick.
    driver.redrawNow(20);
    expect(scene.draw).toHaveBeenCalledTimes(1);

    // It re-anchored the gate, so the next sub-interval tick still gates.
    driver.tick(60);
    expect(scene.draw).toHaveBeenCalledTimes(1);
  });

  it("redrawNow skips the paint while the tab is hidden", () => {
    const { scene, driver } = makeDriver();
    driver.setVisible(false);
    driver.redrawNow(0);
    expect(scene.draw).not.toHaveBeenCalled();
  });

  it("lifts the cap to DAY_FADE_FPS while a manual fade runs and settles at the target", () => {
    const { scene, driver } = makeDriver({ fpsCap: 10, dayTransition: 1, dayness: 0 });
    driver.tick(0); // baseline draw
    driver.setDayness(1, { animated: true });
    const fadeInterval = 1000 / DAY_FADE_FPS;

    // Two ticks one fade-interval apart must BOTH draw (10 fps would gate them).
    driver.tick(100);
    driver.tick(100 + fadeInterval + 1);
    expect(scene.draw).toHaveBeenCalledTimes(3);

    // After the 1 s transition the fade is done and dayness sits at the target.
    driver.tick(1200);
    expect(driver.settings.dayness).toBe(1);

    // Cap is back at 10 fps: a 34 ms step no longer draws.
    scene.draw.mockClear();
    driver.tick(1300);
    driver.tick(1300 + fadeInterval + 1);
    expect(scene.draw).toHaveBeenCalledTimes(1);
  });

  it("snaps dayness without a fade when animated is false", () => {
    const { scene, driver } = makeDriver({ fpsCap: 10, dayness: 0 });
    driver.tick(0);
    scene.draw.mockClear();
    driver.setDayness(1, { animated: false });
    expect(driver.settings.dayness).toBe(1);
    driver.tick(200); // redraw request from the snap
    expect(scene.draw).toHaveBeenCalledTimes(1);
  });

  it("hard-switches instantly (no fade) when dayTransition is 0, even with animated on", () => {
    // dayTransition 0 = the admin's "hard switch" choice: an animated request
    // must snap, never open a fade (a fade would divide by a 0 ms duration → NaN).
    const { driver } = makeDriver({ fpsCap: 10, dayTransition: 0, dayness: 0 });
    driver.tick(0);
    driver.setDayness(1, { animated: true });
    expect(driver.settings.dayness).toBe(1); // snapped on the spot, no pending fade
    driver.tick(100); // a later tick must not corrupt the value into NaN
    expect(driver.settings.dayness).toBe(1);
  });

  it("renders exactly one static frame under reduced motion", () => {
    const { scene, driver } = makeDriver();
    driver.setReducedMotion(true);
    driver.tick(0);
    driver.tick(200);
    driver.tick(400);
    expect(scene.draw).toHaveBeenCalledTimes(1);
  });

  it("draws nothing while the tab is hidden and resumes afterwards", () => {
    const { scene, driver } = makeDriver({ fpsCap: 10 });
    driver.setVisible(false);
    driver.tick(0);
    driver.tick(200);
    expect(scene.draw).not.toHaveBeenCalled();
    driver.setVisible(true);
    driver.tick(400);
    expect(scene.draw).toHaveBeenCalledTimes(1);
  });

  // setAutoDayNight (plan MC-030 Task 1): the runtime switch of the local-clock
  // automatic. The clock reads `new Date()`, so these tests pin the wall clock
  // with fake timers; tick timestamps stay manual scheduler time as above.
  // Default twilight config: sunrise 6.5, sunset 20.5, twilight 1.5 → noon
  // maps to dayness 1, 23:00 to dayness 0.
  describe("setAutoDayNight", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fades to the current clock value when enabled, then follows the clock", () => {
      vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0)); // noon → clock dayness 1
      const { driver } = makeDriver({ fpsCap: 10, dayTransition: 1, dayness: 0 });
      driver.tick(0);

      driver.setAutoDayNight(true);
      expect(driver.settings.autoDayNight).toBe(1);

      // The transition is ANIMATED: it anchors on the first tick and sits
      // between the endpoints halfway through (a snap would already be 1).
      driver.tick(100); // fade anchors here
      driver.tick(600); // t = 0.5
      expect(driver.settings.dayness).toBeGreaterThan(0);
      expect(driver.settings.dayness).toBeLessThan(1);

      // After the 1 s transition the clock value is reached…
      driver.tick(1200);
      expect(driver.settings.dayness).toBe(1);

      // …and from then on the clock keeps stepping the blend.
      vi.setSystemTime(new Date(2026, 5, 13, 23, 0, 0)); // night → clock dayness 0
      driver.tick(1400);
      expect(driver.settings.dayness).toBe(0);
    });

    it("snaps to the clock value under reduced motion", () => {
      vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0));
      const { driver } = makeDriver({ dayness: 0 });
      driver.setReducedMotion(true);
      driver.setAutoDayNight(true);
      expect(driver.settings.dayness).toBe(1);
    });

    it("stops following the clock when disabled and leaves dayness untouched", () => {
      vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0));
      const { driver } = makeDriver({ fpsCap: 10, dayTransition: 1, dayness: 0 });
      driver.tick(0);
      driver.setAutoDayNight(true);
      driver.tick(100);
      driver.tick(1200); // fade settled → dayness 1
      expect(driver.settings.dayness).toBe(1);

      driver.setAutoDayNight(false);
      expect(driver.settings.autoDayNight).toBe(0);

      // The clock says night now, but the automatic is off → no stepping;
      // the follow-up target is the bridge's separate SetDayness call.
      vi.setSystemTime(new Date(2026, 5, 13, 23, 0, 0));
      driver.tick(1400);
      expect(driver.settings.dayness).toBe(1);
    });
  });
});
