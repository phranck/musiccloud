import { cn } from "@/lib/utils";

export interface CDSpinArtworkProps {
  /**
   * Tailwind utility classes controlling the outer tile dimensions (and
   * optional layout tweaks like `flex-shrink-0`). Required because the
   * spinner has no natural size — every call site picks a different scale:
   *
   *   - Disambiguation row: `"w-14 h-14 md:w-16 md:h-16 flex-shrink-0"`
   *   - Hero-input button:  `"w-11 h-11 md:w-12 md:h-12"`
   *   - Track-list marker:  `"w-10 h-10"`
   *
   * Must set a concrete width and height; the spinner's inner layers rely
   * on `inset-0` and `%`-based positions which need a sized parent.
   */
  className: string;
}

/**
 * Animated CD-disc spinner used as a loading indicator. Shows a metallic
 * disc with a static iridescent ring and a black centre label, spinning via
 * `animate-vinyl-spin` (`styles/animations.css`). Visually a CD, not a
 * vinyl record — the disc is silver with an iridescent data-side sheen.
 *
 * Sized by the caller via `className` rather than a numeric `size` prop
 * because our different call sites already express their dimensions in
 * Tailwind classes (and rely on responsive breakpoints), so funnelling
 * everything through a pixel number would either drop responsiveness or
 * re-encode Tailwind logic in component internals.
 */
export function CDSpinArtwork({ className }: CDSpinArtworkProps) {
  return (
    <div className={cn("relative animate-vinyl-spin", className)}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--color-cd-surface-highlight) 0%, var(--color-cd-surface-mid) 38%, var(--color-cd-surface-sheen) 68%, var(--color-cd-surface-shadow) 100%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 30deg, var(--color-cd-iridescent-violet) 0%, var(--color-cd-iridescent-blue) 20%, var(--color-cd-iridescent-green) 35%, var(--color-cd-iridescent-yellow) 50%, var(--color-cd-iridescent-pink) 65%, var(--color-cd-iridescent-violet) 80%, transparent 95%)",
        }}
      />
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle at 35% 30%, var(--color-cd-highlight) 0%, transparent 38%)",
        }}
      />
      <div
        className="absolute rounded-full bg-background"
        style={{ top: "38%", left: "38%", width: "24%", height: "24%" }}
      />
    </div>
  );
}
