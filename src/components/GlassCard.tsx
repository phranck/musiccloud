import { cn } from "../lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  elevated?: boolean;
  className?: string;
}

export function GlassCard({
  children,
  elevated = false,
  className,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden",
        "glass-fallback",
        elevated
          ? [
              "bg-surface-elevated/80 backdrop-blur-[24px]",
              "border border-white/[0.12]",
              "shadow-xl",
            ]
          : [
              "bg-surface/70 backdrop-blur-[20px]",
              "border border-white/[0.08]",
              "shadow-lg",
            ],
        className,
      )}
    >
      {children}
    </div>
  );
}
