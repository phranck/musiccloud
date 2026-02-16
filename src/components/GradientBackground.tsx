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
  primary: "rgba(44, 185, 200, 0.18)",
  secondary: "rgba(212, 168, 67, 0.12)",
  tertiary: "rgba(24, 150, 164, 0.08)",
};

export function GradientBackground({ albumColors }: GradientBackgroundProps) {
  const colors = albumColors ?? DEFAULT_COLORS;

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-background"
      aria-hidden="true"
    >
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
