import { cn } from "@/lib/utils";
import { recessedStyle } from "@/styles/neumorphic";

interface RecessedCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Width of the gradient border. Defaults to 1px. */
  borderWidth?: string;
  /**
   * Corner radius as a CSS length (e.g. "0.75rem", "12px", "1rem").
   *
   * Sets BOTH `border-radius` AND `--neu-radius` in lockstep so the
   * gradient-border transition arc stays aligned with the actual rounded
   * corner. Pass a single value, or an object for responsive radii:
   *
   *   radius="0.75rem"                       // 12 px everywhere
   *   radius={{ base: "0.75rem", sm: "1rem" }}  // 12 px mobile → 16 px from sm up
   *
   * When omitted, defaults to 1 rem (16 px — matches the original
   * `rounded-2xl` baseline). Consumers should prefer this prop over
   * `rounded-*` Tailwind classes so the accent stays in sync.
   */
  radius?: string | { base: string; sm?: string };
}

const DEFAULT_RADIUS = "1rem"; // matches original --neu-radius default (16 px)

/**
 * A card with a recessed/inset appearance. Light source from top-left:
 * dark shadow on top/left edges, subtle highlight on bottom/right.
 *
 * Includes padding (p-4) and overflow hidden by default.
 *
 * Set the corner radius via the `radius` prop, not via `rounded-*` classes
 * — the component needs to know the radius to align the gradient-border
 * transition with the corner arc (see `--neu-radius` in neumorphic.css).
 */
export function RecessedCard({ children, className, style, borderWidth, radius }: RecessedCardProps) {
  const radiusBase = typeof radius === "string" ? radius : (radius?.base ?? DEFAULT_RADIUS);
  const radiusSm = typeof radius === "object" ? radius.sm : undefined;

  const mergedStyle: React.CSSProperties = {
    ...recessedStyle,
    // `--neu-radius-base` / `--neu-radius-sm` are read by neumorphic.css,
    // which assigns the active value into `--neu-radius` via a media query.
    // We cannot set `--neu-radius` inline directly — inline custom props
    // outrank @media rules, so the sm override would never apply.
    //
    // Both variables MUST be set on every RecessedCard, even when the
    // caller didn't provide an sm override. Custom properties inherit by
    // default, so an ancestor RecessedCard with `{ base, sm }` would leak
    // its `--neu-radius-sm` into a child that only has a string `radius`,
    // and the child would render with the ancestor's sm value at ≥ 640 px.
    // Defaulting sm to base here makes every card self-contained.
    "--neu-radius-base": radiusBase,
    "--neu-radius-sm": radiusSm ?? radiusBase,
    ...(borderWidth ? { "--neu-border-width": borderWidth } : {}),
    // border-radius is set INLINE (not via the `.recessed-gradient-border`
    // class) because that class is also used by EmbossedButton in its
    // pressed state — adding the rule there would mutate other components'
    // shape on toggle. The inline `var(--neu-radius)` re-evaluates whenever
    // the @media query swaps the active value, so responsive radii still
    // work end-to-end.
    borderRadius: "var(--neu-radius)",
    ...style,
  } as React.CSSProperties;

  return (
    <div
      className={cn("recessed-gradient-border bg-black/25 backdrop-blur-md p-4 overflow-hidden", className)}
      style={mergedStyle}
    >
      {children}
    </div>
  );
}
