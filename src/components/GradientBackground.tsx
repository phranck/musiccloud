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
  primary: "rgba(110, 110, 247, 0.18)",
  secondary: "rgba(252, 92, 156, 0.12)",
  tertiary: "rgba(59, 130, 246, 0.08)",
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
          "absolute rounded-full blur-[100px] w-[30vw] h-[30vw] max-w-[500px] max-h-[500px]",
          "will-change-transform",
          "animate-gradient-float",
          "top-[10%] left-[15%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.primary }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[100px] w-[25vw] h-[25vw] max-w-[500px] max-h-[500px]",
          "will-change-transform",
          "animate-gradient-float [animation-delay:-7s]",
          "top-[50%] right-[10%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        className={cn(
          "absolute rounded-full blur-[100px] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px]",
          "will-change-transform",
          "animate-gradient-float [animation-delay:-14s]",
          "bottom-[5%] left-[40%]",
          "transition-[background-color] duration-800 ease-in-out",
          "motion-reduce:animate-none",
        )}
        style={{ backgroundColor: colors.tertiary }}
      />
    </div>
  );
}
