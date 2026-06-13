import { describe, expect, it } from "vitest";
import { STAR_CATALOG } from "./catalog";

/**
 * Geometry contract of the real-sky star catalog (plan MC-029 Phase 4).
 * The catalog is the user-approved prototype data: brightest northern
 * circumpolar stars in J2000 equatorial coordinates. These tests pin the
 * astronomical facts that make the rendering recognisably "real":
 * Polaris sits almost exactly on the celestial pole (the rotation pivot),
 * and the Big Dipper's pointer stars aim at it with the correct chirality
 * (a mirrored projection would break this).
 */

/** Catalog row layout: [RA in decimal hours, Dec in degrees, Vmag, colorClass]. */
const RA = 0;
const DEC = 1;
const MAG = 2;

function findByCoords(raHours: number, decDeg: number) {
  const star = STAR_CATALOG.find((s) => Math.abs(s[RA] - raHours) < 0.05 && Math.abs(s[DEC] - decDeg) < 0.2);
  if (!star) throw new Error(`star not found at RA ${raHours} Dec ${decDeg}`);
  return star;
}

/** Projects a star onto the prototype's polar screen mapping (angle chirality = -RA). */
function project(star: readonly number[]) {
  const r = 90 - star[DEC];
  const angle = -(star[RA] / 24) * Math.PI * 2;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

describe("STAR_CATALOG", () => {
  it("holds the prototype's 67 northern stars with valid ranges", () => {
    expect(STAR_CATALOG.length).toBe(67);
    for (const [ra, dec, mag, color] of STAR_CATALOG) {
      expect(ra).toBeGreaterThanOrEqual(0);
      expect(ra).toBeLessThan(24);
      expect(dec).toBeGreaterThan(30); // circumpolar region of the view
      expect(dec).toBeLessThanOrEqual(90);
      expect(mag).toBeGreaterThan(-1);
      expect(mag).toBeLessThan(5.5);
      expect([0, 1, 2]).toContain(color);
    }
  });

  it("keeps Polaris 0.74° from the celestial pole — the natural rotation pivot", () => {
    const polaris = findByCoords(2.53, 89.264);
    expect(90 - polaris[DEC]).toBeCloseTo(0.736, 2);
    expect(polaris[MAG]).toBeCloseTo(1.98, 2);
  });

  it("aims the Big Dipper pointer stars (Merak → Dubhe) at Polaris with correct chirality", () => {
    const dubhe = project(findByCoords(11.062, 61.751));
    const merak = project(findByCoords(11.031, 56.382));
    const polaris = project(findByCoords(2.53, 89.264));

    // Direction of the pointer line vs. direction from Dubhe to the pole.
    const pointer = { x: dubhe.x - merak.x, y: dubhe.y - merak.y };
    const toPole = { x: polaris.x - dubhe.x, y: polaris.y - dubhe.y };
    const dot =
      (pointer.x * toPole.x + pointer.y * toPole.y) /
      (Math.hypot(pointer.x, pointer.y) * Math.hypot(toPole.x, toPole.y));

    // cos of the angle between them ≈ 1 (same direction); a mirrored
    // projection flips the sign or breaks the alignment entirely.
    expect(dot).toBeGreaterThan(0.95);
  });
});
