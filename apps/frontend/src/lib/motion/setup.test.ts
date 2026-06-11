import gsap from "gsap";
import { describe, expect, it } from "vitest";
import { MotionEase } from "./constants";
import { setupMotion } from "./setup";

/**
 * Importing `./setup` runs the GSAP registration as a module side effect, so by
 * the time these tests execute the `mcOut` CustomEase and the Flip plugin are
 * already registered. The suite verifies that contract and that re-running the
 * setup is a safe no-op.
 *
 * Note: `prefersReducedMotion()` is intentionally NOT exercised here. It reads
 * `window.matchMedia` directly (one-shot, no GSAP context) — unavailable in
 * jsdom by default, and its gate behavior is covered by the factory suites
 * (flip/swap/entrances/collapse/coverSwap), which stub matchMedia themselves.
 * The plan scopes this test to setup idempotency and the existence of the
 * custom eases, so we keep it free of a matchMedia stub.
 */
describe("motion setup", () => {
  it("registers the mcOut CustomEase so gsap.parseEase resolves it", () => {
    expect(typeof gsap.parseEase(MotionEase.McOut)).toBe("function");
  });

  it("produces a valid easing curve that maps the unit interval to itself", () => {
    const ease = gsap.parseEase(MotionEase.McOut);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // cubic-bezier(0.16, 1, 0.3, 1) is a strong ease-out: well past halfway at t=0.5.
    expect(ease(0.5)).toBeGreaterThan(0.5);
    expect(ease(0.5)).toBeLessThanOrEqual(1);
  });

  it("registers the mcIn CustomEase (CSS ease-in port) with accelerate-away shape", () => {
    const ease = gsap.parseEase(MotionEase.McIn);
    expect(typeof ease).toBe("function");
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // cubic-bezier(0.42, 0, 1, 1) accelerates: below the diagonal at t=0.5.
    expect(ease(0.5)).toBeLessThan(0.5);
  });

  it("registers the mcFade CustomEase (fade-in deceleration port)", () => {
    const ease = gsap.parseEase(MotionEase.McFade);
    expect(typeof ease).toBe("function");
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    // cubic-bezier(0, 0, 0.2, 1) decelerates: above the diagonal at t=0.5.
    expect(ease(0.5)).toBeGreaterThan(0.5);
  });

  it("is idempotent: calling setupMotion again is a no-op and keeps the ease intact", () => {
    const before = gsap.parseEase(MotionEase.McOut);
    expect(() => {
      setupMotion();
      setupMotion();
    }).not.toThrow();
    const after = gsap.parseEase(MotionEase.McOut);
    // The guard prevents re-registration, so the resolved ease is the same
    // function reference before and after redundant setup calls.
    expect(after).toBe(before);
    expect(typeof after).toBe("function");
  });
});
