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
    const opacity = brightness > 0.85 ? 0.2 + rand() * 0.15 : 0.04 + rand() * 0.1;
    const size = brightness > 0.85 ? 1.5 : 1;
    stars.push(`${x}vw ${y}dvh 0 ${size}px rgba(220, 235, 245, ${opacity})`);
  }

  return stars.join(", ");
}

// Orion constellation - positioned upper-right of center
const ORION_STARS: { name: string; rx: number; ry: number; brightness: number; warm?: boolean }[] = [
  { name: "Betelgeuse", rx: 0.18, ry: 0.08, brightness: 0.7, warm: true },
  { name: "Bellatrix", rx: 0.65, ry: 0.14, brightness: 0.5 },
  { name: "Alnitak", rx: 0.33, ry: 0.48, brightness: 0.4 },
  { name: "Alnilam", rx: 0.41, ry: 0.48, brightness: 0.45 },
  { name: "Mintaka", rx: 0.49, ry: 0.47, brightness: 0.4 },
  { name: "Saiph", rx: 0.22, ry: 0.85, brightness: 0.35 },
  { name: "Rigel", rx: 0.7, ry: 0.9, brightness: 0.6 },
];

// Canis Major - positioned lower-left, Sirius is the brightest star in the sky
const CANIS_MAJOR_STARS: { name: string; rx: number; ry: number; brightness: number }[] = [
  { name: "Sirius", rx: 0.45, ry: 0.05, brightness: 0.8 },
  { name: "Mirzam", rx: 0.75, ry: 0.12, brightness: 0.35 },
  { name: "Wezen", rx: 0.4, ry: 0.48, brightness: 0.3 },
  { name: "Adhara", rx: 0.35, ry: 0.72, brightness: 0.35 },
  { name: "Aludra", rx: 0.65, ry: 0.65, brightness: 0.25 },
  { name: "Furud", rx: 0.15, ry: 0.85, brightness: 0.2 },
];

type ConstellationStar = { name: string; rx: number; ry: number; brightness: number; warm?: boolean };

function generateConstellationShadow(stars: ConstellationStar[], ox: number, oy: number, w: number, h: number): string {
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

// Layered sine waves for organic, never-repeating blob movement
// Random parameters on each page load = unique path every time
interface WaveParams {
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

function randomWaveParams(): WaveParams {
  const r = () => Math.random();
  const TAU = Math.PI * 2;
  return {
    // 3 layered sine waves per axis for complex paths
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

function computeBlobTransform(params: WaveParams, t: number): string {
  // t is in radians, one full cycle = TAU
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
const CYCLE_DURATION_MS = 180_000;

export function GradientBackground({ albumColors }: GradientBackgroundProps) {
  const colors = albumColors ?? DEFAULT_COLORS;
  const flashRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  const starfieldShadow = useMemo(() => generateStarfield(), []);
  const orionShadow = useMemo(() => generateConstellationShadow(ORION_STARS, 72, 4, 16, 28), []);
  const canisMajorShadow = useMemo(() => generateConstellationShadow(CANIS_MAJOR_STARS, 12, 55, 14, 28), []);

  // Generate random wave params once per page load
  const waveParams = useMemo(() => [randomWaveParams(), randomWaveParams(), randomWaveParams()], []);

  // Blob drift animation via requestAnimationFrame
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    let raf: number;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const t = (elapsed / CYCLE_DURATION_MS) * Math.PI * 2;

      for (let i = 0; i < 3; i++) {
        const el = blobRefs.current[i];
        if (el) {
          el.style.transform = computeBlobTransform(waveParams[i], t);
        }
      }

      raf = requestAnimationFrame(animate);
    }

    raf = requestAnimationFrame(animate);

    const handleMotionChange = () => {
      if (motionQuery.matches) cancelAnimationFrame(raf);
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      cancelAnimationFrame(raf);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [waveParams]);

  // Lightning flash effect
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
    <div className="fixed inset-0 -z-10 overflow-hidden bg-background" aria-hidden="true">
      {/* Rotating starfield wrapper - center of rotation = center of viewport (search field) */}
      <div className="absolute inset-0 animate-starfield-rotate" style={{ transformOrigin: "50vw 50dvh" }}>
        {/* Fixed starfield - single element, many box-shadows */}
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: starfieldShadow }} />

        {/* Orion constellation - subtle, upper-right */}
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: orionShadow }} />

        {/* Canis Major - subtle, lower-left */}
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: canisMajorShadow }} />
      </div>

      {/* Lightning flash - behind blobs */}
      <div
        ref={flashRef}
        className="absolute rounded-full opacity-0 pointer-events-none"
        style={{
          filter: "blur(80px)",
          background: "radial-gradient(circle, var(--color-accent-glow), transparent 70%)",
        }}
      />

      {/* Blob 1 */}
      <div
        ref={(el) => {
          blobRefs.current[0] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[150px] w-[50vw] h-[50vw]",
          "will-change-transform",
          "top-[-5%] left-[-5%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.primary }}
      />
      {/* Blob 2 */}
      <div
        ref={(el) => {
          blobRefs.current[1] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[160px] w-[45vw] h-[45vw]",
          "will-change-transform",
          "top-[30%] right-[-10%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.secondary }}
      />
      {/* Blob 3 */}
      <div
        ref={(el) => {
          blobRefs.current[2] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[170px] w-[55vw] h-[55vw]",
          "will-change-transform",
          "bottom-[-10%] left-[30%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.tertiary }}
      />
    </div>
  );
}
