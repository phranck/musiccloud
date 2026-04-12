import { useEffect, useMemo, useRef } from "react";
import type { AlbumColors } from "@/lib/ui/colors";
import {
  CANIS_MAJOR_STARS,
  CYCLE_DURATION_MS,
  computeBlobTransform,
  generateConstellationShadow,
  generateStarfield,
  ORION_STARS,
  randomWaveParams,
} from "@/lib/ui/starfield";
import { cn } from "@/lib/utils";

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
  const blobRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  const starfieldShadow = useMemo(() => generateStarfield(), []);
  const orionShadow = useMemo(() => generateConstellationShadow(ORION_STARS, 72, 4, 16, 28), []);
  const canisMajorShadow = useMemo(() => generateConstellationShadow(CANIS_MAJOR_STARS, 12, 55, 14, 28), []);

  const waveParams = useMemo(() => [randomWaveParams(), randomWaveParams(), randomWaveParams()], []);

  // Blob drift animation via requestAnimationFrame
  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    if (window.matchMedia("(pointer: coarse)").matches) return;

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

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!motionQuery.matches) {
        raf = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      motionQuery.removeEventListener("change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [waveParams]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-background" aria-hidden="true">
      <div
        className="absolute inset-0 animate-starfield-rotate hidden sm:block"
        style={{ transformOrigin: "50vw 50dvh" }}
      >
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: starfieldShadow }} />
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: orionShadow }} />
        <div className="absolute w-px h-px top-0 left-0" style={{ boxShadow: canisMajorShadow }} />
      </div>

      <div
        ref={(el) => {
          blobRefs.current[0] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[150px] w-[50vw] h-[50vw]",
          "top-[-5%] left-[-5%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.primary }}
      />
      <div
        ref={(el) => {
          blobRefs.current[1] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[160px] w-[45vw] h-[45vw]",
          "top-[30%] right-[-10%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        ref={(el) => {
          blobRefs.current[2] = el;
        }}
        className={cn(
          "absolute rounded-full blur-[170px] w-[55vw] h-[55vw]",
          "bottom-[-10%] left-[30%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{ backgroundColor: colors.tertiary }}
      />
    </div>
  );
}
