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
  primary: "rgba(124, 92, 252, 0.2)",
  secondary: "rgba(252, 92, 156, 0.15)",
  tertiary: "rgba(59, 130, 246, 0.1)",
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
          "absolute rounded-full blur-[80px] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px]",
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
          "absolute rounded-full blur-[80px] w-[35vw] h-[35vw] max-w-[600px] max-h-[600px]",
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
          "absolute rounded-full blur-[80px] w-[45vw] h-[45vw] max-w-[600px] max-h-[600px]",
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
