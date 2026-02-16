import { useEffect, useMemo, useRef } from "react";
import { cn } from "../lib/utils";

interface AlbumColors {
  primary: string;
  secondary: string;
  tertiary: string;
}

interface GradientBackgroundProps {
  albumColors?: AlbumColors;
}

const DEFAULT_COLORS = {
  primary: "rgba(40, 168, 216, 0.18)",
  secondary: "rgba(212, 168, 67, 0.12)",
  tertiary: "rgba(22, 140, 180, 0.08)",
};

// Deterministic pseudo-random for consistent starfield across renders
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// Generate fixed starfield as a single box-shadow string (one DOM element)
function generateStarfield(): string {
  const rand = seededRandom(42);
  const stars: string[] = [];

  for (let i = 0; i < 90; i++) {
    const x = rand() * 100;
    const y = rand() * 100;
    const brightness = rand();
    // Most stars dim, a few brighter
    const opacity = brightness > 0.85 ? 0.2 + rand() * 0.15 : 0.04 + rand() * 0.1;
    const size = brightness > 0.85 ? 1.5 : 1;
    stars.push(
      `${x}vw ${y}vh 0 ${size}px rgba(220, 235, 245, ${opacity})`
    );
  }

  return stars.join(", ");
}

// Orion constellation - positioned upper-right of center
// Relative positions within a bounding box, then mapped to screen coordinates
const ORION_STARS: { name: string; rx: number; ry: number; brightness: number; warm?: boolean }[] = [
  // Shoulders - wide apart
  { name: "Betelgeuse", rx: 0.18, ry: 0.08, brightness: 0.7, warm: true },
  { name: "Bellatrix", rx: 0.65, ry: 0.14, brightness: 0.5 },
  // Belt - nearly horizontal, evenly spaced
  { name: "Alnitak", rx: 0.33, ry: 0.48, brightness: 0.4 },
  { name: "Alnilam", rx: 0.41, ry: 0.48, brightness: 0.45 },
  { name: "Mintaka", rx: 0.49, ry: 0.47, brightness: 0.4 },
  // Legs - spread wide again
  { name: "Saiph", rx: 0.22, ry: 0.85, brightness: 0.35 },
  { name: "Rigel", rx: 0.70, ry: 0.90, brightness: 0.6 },
];

// Canis Major - positioned lower-left, Sirius is the brightest star in the sky
const CANIS_MAJOR_STARS: { name: string; rx: number; ry: number; brightness: number }[] = [
  { name: "Sirius", rx: 0.45, ry: 0.05, brightness: 0.8 },
  { name: "Mirzam", rx: 0.75, ry: 0.12, brightness: 0.35 },
  { name: "Wezen", rx: 0.40, ry: 0.48, brightness: 0.3 },
  { name: "Adhara", rx: 0.35, ry: 0.72, brightness: 0.35 },
  { name: "Aludra", rx: 0.65, ry: 0.65, brightness: 0.25 },
  { name: "Furud", rx: 0.15, ry: 0.85, brightness: 0.2 },
];

type ConstellationStar = { name: string; rx: number; ry: number; brightness: number; warm?: boolean };

function generateConstellationShadow(
  stars: ConstellationStar[],
  ox: number, oy: number, w: number, h: number,
): string {
  return stars.map((star) => {
    const x = ox + star.rx * w;
    const y = oy + star.ry * h;
    const color = star.warm
      ? `rgba(255, 200, 160, ${star.brightness})`
      : `rgba(210, 230, 255, ${star.brightness})`;
    const size = star.brightness > 0.5 ? 1.5 : 1;
    return `${x}vw ${y}vh 0 ${size}px ${color}`;
  }).join(", ");
}

export function GradientBackground({ albumColors }: GradientBackgroundProps) {
  const colors = albumColors ?? DEFAULT_COLORS;
  const flashRef = useRef<HTMLDivElement>(null);

  const starfieldShadow = useMemo(() => generateStarfield(), []);
  const orionShadow = useMemo(() => generateConstellationShadow(ORION_STARS, 58, 10, 16, 28), []);
  const canisMajorShadow = useMemo(() => generateConstellationShadow(CANIS_MAJOR_STARS, 12, 55, 14, 28), []);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    let active = true;
    let timeout: ReturnType<typeof setTimeout>;

    function triggerFlash() {
      if (!active || !flashRef.current) return;

      const el = flashRef.current;
      const x = 15 + Math.random() * 70;
      const y = 10 + Math.random() * 60;
      const size = 25 + Math.random() * 30;

      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.width = `${size}vw`;
      el.style.height = `${size}vw`;
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = `lightning-flash ${0.15 + Math.random() * 0.2}s ease-out`;

      scheduleNext();
    }

    function scheduleNext() {
      if (!active) return;
      const delay = 8000 + Math.random() * 18000;
      timeout = setTimeout(triggerFlash, delay);
    }

    scheduleNext();

    const handleMotionChange = () => {
      if (motionQuery.matches) {
        active = false;
        clearTimeout(timeout);
      }
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      active = false;
      clearTimeout(timeout);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-background"
      aria-hidden="true"
    >
      {/* Fixed starfield - single element, many box-shadows */}
      <div
        className="absolute w-px h-px top-0 left-0"
        style={{ boxShadow: starfieldShadow }}
      />

      {/* Orion constellation - subtle, upper-right */}
      <div
        className="absolute w-px h-px top-0 left-0"
        style={{ boxShadow: orionShadow }}
      />

      {/* Canis Major - subtle, lower-left */}
      <div
        className="absolute w-px h-px top-0 left-0"
        style={{ boxShadow: canisMajorShadow }}
      />

      {/* Lightning flash - behind blobs */}
      <div
        ref={flashRef}
        className="absolute rounded-full opacity-0 pointer-events-none"
        style={{
          filter: "blur(80px)",
          background: "radial-gradient(circle, var(--color-accent-glow), transparent 70%)",
        }}
      />

      <div
        className={cn(
          "absolute rounded-full blur-[120px] w-[35vw] h-[35vw]",
          "will-change-transform",
          "animate-blob-drift-1",
          "top-[-5%] left-[-5%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.primary }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[130px] w-[30vw] h-[30vw]",
          "will-change-transform",
          "animate-blob-drift-2",
          "top-[30%] right-[-10%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[140px] w-[40vw] h-[40vw]",
          "will-change-transform",
          "animate-blob-drift-3",
          "bottom-[-10%] left-[30%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.tertiary }}
      />
    </div>
  );
}
