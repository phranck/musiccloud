import type React from "react";

interface ContentUnavailableViewProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  className?: string;
}

export function ContentUnavailableView({ icon, title, subtitle, className }: ContentUnavailableViewProps) {
  return (
    <div
      className={["grid w-full h-full min-h-80 place-items-center self-stretch p-6 text-center", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <span className="text-[var(--ds-text-muted)] [&_svg]:w-12 [&_svg]:h-12">{icon}</span>
        <div className="space-y-1">
          <p className="text-lg font-bold font-heading text-[var(--ds-text)]">{title}</p>
          <p className="text-xs text-[var(--ds-text-muted)] max-w-[240px] mx-auto leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
