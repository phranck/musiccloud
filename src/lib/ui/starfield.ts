// ---------------------------------------------------------------------------
// Starfield – pure math functions for GradientBackground
// All functions are deterministic or use Math.random on page load only.
// ---------------------------------------------------------------------------

// Deterministic pseudo-random for consistent starfield across renders
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// Generate fixed starfield as a single box-shadow string (one DOM element)
export function generateStarfield(): string {
  const rand = seededRandom(42);
  const stars: string[] = [];

  for (let i = 0; i < 90; i++) {
    const x = rand() * 100;
    const y = rand() * 100;
    const brightness = rand();
    const opacity = brightness > 0.85 ? 0.2 + rand() * 0.15 : 0.04 + rand() * 0.1;
    const size = brightness > 0.85 ? 1.5 : 1;
    stars.push(`${x}vw ${y}dvh 0 ${size}px rgba(220, 235, 245, ${opacity})`);
  }

  return stars.join(", ");
}

// ---------------------------------------------------------------------------
// Constellation data
// ---------------------------------------------------------------------------

export type ConstellationStar = {
  name: string;
  rx: number;
  ry: number;
  brightness: number;
  warm?: boolean;
};

// Orion constellation - positioned upper-right of center
export const ORION_STARS: ConstellationStar[] = [
  { name: "Betelgeuse", rx: 0.18, ry: 0.08, brightness: 0.7, warm: true },
  { name: "Bellatrix", rx: 0.65, ry: 0.14, brightness: 0.5 },
  { name: "Alnitak", rx: 0.33, ry: 0.48, brightness: 0.4 },
  { name: "Alnilam", rx: 0.41, ry: 0.48, brightness: 0.45 },
  { name: "Mintaka", rx: 0.49, ry: 0.47, brightness: 0.4 },
  { name: "Saiph", rx: 0.22, ry: 0.85, brightness: 0.35 },
  { name: "Rigel", rx: 0.7, ry: 0.9, brightness: 0.6 },
];

// Canis Major - positioned lower-left, Sirius is the brightest star in the sky
export const CANIS_MAJOR_STARS: ConstellationStar[] = [
  { name: "Sirius", rx: 0.45, ry: 0.05, brightness: 0.8 },
  { name: "Mirzam", rx: 0.75, ry: 0.12, brightness: 0.35 },
  { name: "Wezen", rx: 0.4, ry: 0.48, brightness: 0.3 },
  { name: "Adhara", rx: 0.35, ry: 0.72, brightness: 0.35 },
  { name: "Aludra", rx: 0.65, ry: 0.65, brightness: 0.25 },
  { name: "Furud", rx: 0.15, ry: 0.85, brightness: 0.2 },
];

export function generateConstellationShadow(
  stars: ConstellationStar[],
  ox: number,
  oy: number,
  w: number,
  h: number,
): string {
  return stars
    .map((star) => {
      const x = ox + star.rx * w;
      const y = oy + star.ry * h;
      const color = star.warm
        ? `rgba(255, 200, 160, ${star.brightness})`
        : `rgba(210, 230, 255, ${star.brightness})`;
      const size = star.brightness > 0.5 ? 1.5 : 1;
      return `${x}vw ${y}dvh 0 ${size}px ${color}`;
    })
    .join(", ");
}

// ---------------------------------------------------------------------------
// Layered sine wave blob animation
// Random parameters on each page load = unique path every time
// ---------------------------------------------------------------------------

export interface WaveParams {
  freqX: number[];
  freqY: number[];
  ampX: number[];
  ampY: number[];
  phaseX: number[];
  phaseY: number[];
  freqScale: number;
  phaseScale: number;
  freqRot: number;
  phaseRot: number;
}

export function randomWaveParams(): WaveParams {
  const r = () => Math.random();
  const TAU = Math.PI * 2;
  return {
    freqX: [0.8 + r() * 0.4, 1.6 + r() * 0.8, 2.5 + r() * 1.5],
    freqY: [0.7 + r() * 0.5, 1.4 + r() * 0.9, 2.3 + r() * 1.2],
    ampX: [35 + r() * 25, 15 + r() * 15, 5 + r() * 10],
    ampY: [30 + r() * 25, 15 + r() * 15, 5 + r() * 10],
    phaseX: [r() * TAU, r() * TAU, r() * TAU],
    phaseY: [r() * TAU, r() * TAU, r() * TAU],
    freqScale: 0.5 + r() * 0.5,
    phaseScale: r() * TAU,
    freqRot: 0.3 + r() * 0.4,
    phaseRot: r() * TAU,
  };
}

export function computeBlobTransform(params: WaveParams, t: number): string {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 3; i++) {
    x += params.ampX[i] * Math.sin(params.freqX[i] * t + params.phaseX[i]);
    y += params.ampY[i] * Math.sin(params.freqY[i] * t + params.phaseY[i]);
  }
  const scale = 0.85 + 0.3 * Math.sin(params.freqScale * t + params.phaseScale);
  const rotate = 12 * Math.sin(params.freqRot * t + params.phaseRot);
  return `translate(${x}vw, ${y}dvh) scale(${scale.toFixed(3)}) rotate(${rotate.toFixed(1)}deg)`;
}

// Speed: one full base cycle takes ~3 minutes
export const CYCLE_DURATION_MS = 180_000;
