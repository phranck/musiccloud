import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { LogoView } from "@/components/ui/LogoView";
import { animateFadeIn } from "@/lib/motion/entrances";

interface LandingLogoBlockProps {
  /** Whether the search-field return flip is travelling (drives the logo fade-in). */
  isReturning: boolean;
  /** Whether the hero is in its compact (post-result / searching) layout. */
  showCompact: boolean;
}

/**
 * The musiccloud logo above the hero, in one of two layouts.
 *
 * In the centered idle layout it is large; in the compact layout (after a
 * result or while searching) it shrinks and sits top-left. While the
 * search-field return flip travels back to center, the large logo fades back in
 * (the GSAP port of the removed conditional `animate-fade-in` class). The fade
 * is keyed on both flags because compact-cancel flows flip them in the same
 * commit; it only runs in the large (non-compact) layout.
 *
 * @param isReturning - Whether the return flip is in flight.
 * @param showCompact - Whether the compact layout is active.
 */
export function LandingLogoBlock({ isReturning, showCompact }: LandingLogoBlockProps) {
  const logoRef = useRef<HTMLDivElement>(null);

  // While the search-field return flip travels, the large logo fades back in
  // (GSAP port of the removed conditional `animate-fade-in` class). Keyed on
  // both flags: compact-cancel flows flip them in the same commit.
  useGSAP(
    () => {
      if (!isReturning || showCompact) return;
      const el = logoRef.current;
      if (!el) return;
      animateFadeIn(el);
    },
    { dependencies: [isReturning, showCompact] },
  );

  if (showCompact) {
    return (
      <div className="mb-6">
        <LogoView className="w-56 h-auto" />
      </div>
    );
  }

  return (
    <div ref={logoRef} className="flex justify-center mb-10">
      <LogoView className="w-80 sm:w-96 md:w-[28rem] h-auto" />
    </div>
  );
}
