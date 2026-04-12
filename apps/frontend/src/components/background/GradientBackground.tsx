import { useMemo } from "react";
import type { AlbumColors } from "@/lib/ui/colors";
import { CANIS_MAJOR_STARS, generateConstellationShadow, generateStarfield, ORION_STARS } from "@/lib/ui/starfield";
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

  const starfieldShadow = useMemo(() => generateStarfield(), []);
  const orionShadow = useMemo(() => generateConstellationShadow(ORION_STARS, 72, 4, 16, 28), []);
  const canisMajorShadow = useMemo(() => generateConstellationShadow(CANIS_MAJOR_STARS, 12, 55, 14, 28), []);

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
        className={cn(
          "absolute rounded-full blur-[150px] w-[50vw] h-[50vw]",
          "top-[-5%] left-[-5%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{
          backgroundColor: colors.primary,
          animation: "blob-drift-1 120s ease-in-out infinite",
        }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[160px] w-[45vw] h-[45vw]",
          "top-[30%] right-[-10%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{
          backgroundColor: colors.secondary,
          animation: "blob-drift-2 150s ease-in-out infinite",
        }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[170px] w-[55vw] h-[55vw]",
          "bottom-[-10%] left-[30%]",
          "transition-[background-color] duration-800 ease-in-out",
        )}
        style={{
          backgroundColor: colors.tertiary,
          animation: "blob-drift-3 180s ease-in-out infinite",
        }}
      />
    </div>
  );
}
