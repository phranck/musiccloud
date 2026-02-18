import { BrandName } from "./BrandName";

interface HeroSectionProps {
  className?: string;
}

/**
 * Landing page hero: large BrandName heading + "share it everywhere" subtitle.
 * Shown in idle state, hidden once results or disambiguation appear.
 */
export function HeroSection({ className }: HeroSectionProps) {
  return (
    <div className={`flex justify-center mb-10 ${className ?? ""}`}>
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.04em] text-text-primary mb-1">
          <BrandName />
        </h1>
        <p
          className="text-sm sm:text-base md:text-lg font-light tracking-[-0.02em] text-white/70 -mt-1"
          style={{ fontFamily: '"Nasalization", sans-serif' }}
        >
          share it everywhere
        </p>
      </div>
    </div>
  );
}
