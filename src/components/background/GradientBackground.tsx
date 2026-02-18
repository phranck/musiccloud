import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { AlbumColors } from "@/lib/ui/colors";
import {
  CANIS_MAJOR_STARS,
  CYCLE_DURATION_MS,
  ORION_STARS,
  computeBlobTransform,
  generateConstellationShadow,
  generateStarfield,
  randomWaveParams,
} from "@/lib/ui/starfield";

interface GradientBackgroundProps {
  albumColors?: AlbumColors;
}

const DEFAULT_COLORS = {
  primary: "rgba(40, 168, 216, 0.18)",
  secondary: "rgba(212, 168, 67, 0.12)",
  tertiary: "rgba(22, 140, 180, 0.08)",
};

export function GradientBackground({ albumColors }: GradientBackgroundProps) {
  const colors = albumColors ?? DEFAULT_COLORS;
  const flashRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  const starfieldShadow = useMemo(() => generateStarfield(), []);
  const orionShadow = useMemo(() => generateConstellationShadow(ORION_STARS, 72, 4, 16, 28), []);
  const canisMajorShadow = useMemo(() => generateConstellationShadow(CANIS_MAJOR_STARS, 12, 55, 14, 28), []);

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
        if (el) el.style.transform = computeBlobTransform(waveParams[i], t);
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
      <div className="absolute inset-0 animate-starfield-rotate" style={{ transformOrigin: "50vw 50dvh" }}>
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: starfieldShadow }} />
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: orionShadow }} />
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: canisMajorShadow }} />
      </div>

      <div
        ref={flashRef}
        className="absolute rounded-full opacity-0 pointer-events-none"
        style={{
          filter: "blur(80px)",
          background: "radial-gradient(circle, var(--color-accent-glow), transparent 70%)",
        }}
      />

      <div
        ref={(el) => { blobRefs.current[0] = el; }}
        className={cn(
          "absolute rounded-full blur-[150px] w-[50vw] h-[50vw]",
          "will-change-transform",
          "top-[-5%] left-[-5%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.primary }}
      />
      <div
        ref={(el) => { blobRefs.current[1] = el; }}
        className={cn(
          "absolute rounded-full blur-[160px] w-[45vw] h-[45vw]",
          "will-change-transform",
          "top-[30%] right-[-10%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        ref={(el) => { blobRefs.current[2] = el; }}
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
