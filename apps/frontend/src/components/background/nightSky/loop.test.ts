import { describe, expect, it, vi } from "vitest";
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
});
