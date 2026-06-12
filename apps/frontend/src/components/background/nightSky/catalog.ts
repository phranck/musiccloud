/**
 * Real star catalog of the night-sky background — the brightest stars of
 * the northern circumpolar sky (the view toward Polaris from Central
 * Europe), 1:1 from the user-approved prototype (plan MC-029, Phase 4).
 *
 * Polaris (first entry) sits 0.74° from the celestial pole, so it becomes
 * the rotation pivot naturally — with the same tiny wobble as in reality.
 * The complete Little and Big Dipper, Cassiopeia's W, Cepheus, Draco and
 * the bright anchors (Vega, Deneb, Capella, Mirfak …) make the rendered
 * sky genuinely recognisable; the thousands of faint background stars stay
 * procedural in the shader (the eye only identifies the bright patterns).
 *
 * Positions are J2000, accurate to ~0.1° (far below a screen pixel here).
 */

/**
 * One catalog star: `[RA in decimal hours, Dec in degrees, V magnitude,
 * colorClass]` with colorClass 0 = blue-white (B/early A), 1 = white to
 * yellow-white (A/F), 2 = warm (G/K/M).
 */
export type CatalogStar = readonly [raHours: number, decDeg: number, vMag: number, colorClass: 0 | 1 | 2];

/** The 67 brightest northern stars rendered as real point sprites. */
export const STAR_CATALOG: readonly CatalogStar[] = [
  // Ursa Minor — the Little Dipper, incl. Polaris (complete, low-mag members too)
  [2.53, 89.264, 1.98, 1], // Polaris
  [14.845, 74.156, 2.08, 2], // Kochab
  [15.345, 71.834, 3.05, 1], // Pherkad
  [16.766, 82.037, 4.21, 2], // ε UMi
  [15.734, 77.795, 4.32, 1], // ζ UMi
  [17.537, 86.586, 4.35, 1], // δ UMi
  [16.292, 75.755, 4.95, 1], // η UMi

  // Ursa Major — the Big Dipper plus surrounding members
  [11.062, 61.751, 1.79, 2], // Dubhe
  [11.031, 56.382, 2.37, 1], // Merak
  [11.897, 53.695, 2.44, 1], // Phecda
  [12.257, 57.033, 3.31, 1], // Megrez
  [12.9, 55.96, 1.77, 1], // Alioth
  [13.399, 54.925, 2.27, 1], // Mizar
  [13.792, 49.313, 1.86, 0], // Alkaid
  [8.504, 60.718, 3.36, 2], // Muscida
  [9.548, 51.677, 3.18, 1], // θ UMa
  [10.372, 41.499, 3.06, 2], // μ UMa
  [10.285, 42.914, 3.45, 1], // λ UMa
  [11.161, 44.499, 3.01, 2], // ψ UMa
  [9.525, 63.062, 3.67, 1], // h UMa

  // Cassiopeia — the W (complete)
  [0.153, 59.15, 2.27, 1], // Caph
  [0.675, 56.537, 2.24, 2], // Schedar
  [0.945, 60.717, 2.47, 0], // γ Cas
  [1.43, 60.235, 2.68, 1], // Ruchbah
  [1.907, 63.67, 3.38, 0], // Segin

  // Cepheus
  [21.31, 62.585, 2.46, 1], // Alderamin
  [21.478, 70.561, 3.23, 0], // Alfirk
  [23.656, 77.632, 3.21, 2], // Errai
  [22.181, 58.201, 3.35, 2], // ζ Cep
  [20.754, 61.839, 3.43, 2], // η Cep
  [22.828, 66.201, 3.52, 2], // ι Cep

  // Draco — winds between the dippers
  [17.943, 51.489, 2.23, 2], // Eltanin
  [17.507, 52.301, 2.79, 2], // Rastaban
  [16.4, 61.514, 2.74, 2], // η Dra
  [17.146, 65.715, 3.17, 0], // ζ Dra
  [19.209, 67.661, 3.07, 2], // Altais
  [15.415, 58.966, 3.29, 2], // Edasich
  [14.073, 64.376, 3.65, 1], // Thuban
  [18.351, 72.733, 3.57, 1], // χ Dra
  [12.558, 69.788, 3.87, 0], // κ Dra
  [11.523, 69.331, 3.84, 2], // Giausar
  [19.802, 70.268, 3.83, 2], // ε Dra
  [17.892, 56.873, 3.75, 2], // Grumium

  // Lyra / Cygnus — the summer triangle's northern members
  [18.616, 38.784, 0.03, 0], // Vega
  [20.69, 45.28, 1.25, 1], // Deneb
  [20.371, 40.257, 2.23, 1], // Sadr
  [19.749, 45.131, 2.87, 0], // δ Cyg
  [20.77, 33.97, 2.46, 2], // ε Cyg
  [19.285, 53.368, 3.77, 2], // κ Cyg

  // Auriga
  [5.278, 45.998, 0.08, 2], // Capella (golden!)
  [5.992, 44.947, 1.9, 1], // Menkalinan
  [5.995, 37.213, 2.65, 1], // θ Aur
  [5.032, 43.823, 2.99, 1], // ε Aur
  [5.108, 41.234, 3.18, 0], // η Aur
  [5.041, 41.076, 3.75, 2], // ζ Aur
  [5.992, 54.285, 3.72, 2], // δ Aur

  // Perseus
  [3.405, 49.861, 1.79, 1], // Mirfak
  [3.136, 40.956, 2.09, 0], // Algol
  [3.08, 53.506, 2.93, 2], // γ Per
  [3.715, 47.788, 3.01, 0], // δ Per
  [2.845, 55.895, 3.77, 2], // η Per

  // Andromeda (northern members) / Canes Venatici / Boötes (northern) / Lynx
  [2.065, 42.33, 2.26, 2], // Almach
  [1.162, 35.62, 2.05, 2], // Mirach
  [12.934, 38.318, 2.9, 1], // Cor Caroli
  [14.535, 38.308, 3.03, 1], // Seginus
  [15.032, 40.391, 3.5, 2], // Nekkar
  [9.351, 34.393, 3.13, 2], // α Lyn
];

/**
 * Packs the catalog into the vertex-attribute layout the star pass consumes:
 * `vec4(angular distance from pole °, -RA in radians, Vmag, colorClass)`.
 * The negative RA encodes the chirality of looking north from INSIDE the
 * sky sphere — without it every constellation would render mirrored
 * (pinned by the Merak→Dubhe→Polaris pointer test).
 *
 * @returns A fresh Float32Array ready for `gl.bufferData` (4 floats per star).
 */
export function packCatalogAttributes(): Float32Array {
  const data = new Float32Array(STAR_CATALOG.length * 4);
  STAR_CATALOG.forEach(([raHours, decDeg, mag, colorClass], i) => {
    data[i * 4 + 0] = 90 - decDeg;
    data[i * 4 + 1] = -(raHours / 24) * Math.PI * 2;
    data[i * 4 + 2] = mag;
    data[i * 4 + 3] = colorClass;
  });
  return data;
}
