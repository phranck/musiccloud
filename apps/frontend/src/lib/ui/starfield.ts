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
      const color = star.warm ? `rgba(255, 200, 160, ${star.brightness})` : `rgba(210, 230, 255, ${star.brightness})`;
      const size = star.brightness > 0.5 ? 1.5 : 1;
      return `${x}vw ${y}dvh 0 ${size}px ${color}`;
    })
    .join(", ");
}

// ---------------------------------------------------------------------------
// Layered sine wave blob animation
