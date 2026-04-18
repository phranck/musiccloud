import { forwardRef } from "react";
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
   * When omitted, derives the radius from the ancestor `EmbossedCard` via
   * `outerRadius − outerPadding` (the inscribed-square rule). Falls back
   * to `1rem` when rendered standalone (no EmbossedCard ancestor).
   */
  radius?: string | { base: string; sm?: string };
  /**
   * Inner padding as a CSS length. When omitted, derives from the ancestor
   * `EmbossedCard`'s padding (`--emb-padding / 2` — the design convention
   * that inner insets feel "half as tight"). Falls back to `1rem` (the
   * previous `p-4` default) when rendered standalone.
   */
  padding?: string;
}

// Fallback chain defaults: used when RecessedCard is rendered without an
// EmbossedCard ancestor. Preserve the pre-cascade behaviour so existing
// standalone call-sites (NavigationBackButton, SlideArtwork, MediaCard,
// EmbedModal, ArtistProfileSection, EmbedCardIsland) render unchanged.
const STANDALONE_RADIUS_FALLBACK = "1rem";

// When the caller omits `radius`/`padding`, we want `calc()` to resolve to
// the standalone fallback if `--emb-*` isn't set. CSS `var(x, fb)` returns
// `fb` literally when `x` is unset, so we embed the fallback inside the var
// — `calc(var(--emb-radius, 2rem) - var(--emb-padding, 1rem))` yields 1rem
// standalone, and the correct inscribed radius when nested.
const INHERITED_RADIUS_BASE = "calc(var(--emb-radius-base, 2rem) - var(--emb-padding, 1rem))";
const INHERITED_RADIUS_SM = "calc(var(--emb-radius-sm, var(--emb-radius-base, 2rem)) - var(--emb-padding, 1rem))";
const INHERITED_PADDING = "calc(var(--emb-padding, 2rem) / 2)";

// Backward-compat: callers that still set padding via Tailwind (`p-*`,
// `px-*`, etc.) opt out of inline padding so their class wins.
const PADDING_CLASS_RE = /(^|\s)p[xytrbls]?-/;

/**
 * A card with a recessed/inset appearance. Light source from top-left:
 * dark shadow on top/left edges, subtle highlight on bottom/right.
 *
 * When nested inside an `EmbossedCard`, both `radius` and `padding`
 * default to values derived from the parent's published geometry
 * (`--emb-radius` / `--emb-padding`) so the inner card is always
 * inscribed correctly in the outer frame — callers shouldn't need to
 * restate the formula. Pass explicit props to override.
 *
 * Standalone (no EmbossedCard ancestor), defaults to 1 rem radius and
 * 1 rem padding (the previous `rounded-2xl` / `p-4` baseline).
 *
 * Set the corner radius via the `radius` prop, not via `rounded-*`
 * classes — the component needs to know the radius to align the
 * gradient-border transition with the corner arc (see `--neu-radius`
 * in neumorphic.css).
 */
export const RecessedCard = forwardRef<HTMLDivElement, RecessedCardProps>(function RecessedCard(
  { children, className, style, borderWidth, radius, padding },
  ref,
) {
  const radiusBase =
    radius === undefined
      ? INHERITED_RADIUS_BASE
      : typeof radius === "string"
        ? radius
        : (radius.base ?? STANDALONE_RADIUS_FALLBACK);
  const radiusSm =
    radius === undefined
      ? INHERITED_RADIUS_SM
      : typeof radius === "object"
        ? (radius.sm ?? radius.base ?? STANDALONE_RADIUS_FALLBACK)
        : radius;

  // Hybrid padding: if the caller set `p-*` via className, let Tailwind
  // win (backward compat for pre-cascade consumers). Otherwise use the
  // explicit prop, or fall back to the inherited `--emb-padding / 2`.
  const paddingClassOverride = typeof className === "string" && PADDING_CLASS_RE.test(className);
  const paddingValue = padding ?? (paddingClassOverride ? undefined : INHERITED_PADDING);

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
    "--neu-radius-sm": radiusSm,
    ...(borderWidth ? { "--neu-border-width": borderWidth } : {}),
    // border-radius is set INLINE (not via the `.recessed-gradient-border`
    // class) because that class is also used by EmbossedButton in its
    // pressed state — adding the rule there would mutate other components'
    // shape on toggle. The inline `var(--neu-radius)` re-evaluates whenever
    // the @media query swaps the active value, so responsive radii still
    // work end-to-end.
    borderRadius: "var(--neu-radius)",
    ...(paddingValue !== undefined ? { padding: paddingValue } : {}),
    ...style,
  } as React.CSSProperties;

  return (
    <div
      ref={ref}
      className={cn("recessed-gradient-border bg-black/25 backdrop-blur-md overflow-hidden", className)}
      style={mergedStyle}
    >
      {children}
    </div>
  );
});
