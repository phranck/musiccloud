import { Children, createContext, isValidElement, type ReactNode, type Ref, use, useState } from "react";
import { cn } from "@/lib/utils";
import { recessedStyle } from "@/styles/neumorphic";

// ─── Sub-component type tags ───────────────────────────────────────────────

const HEADER_TAG = Symbol("RecessedCard.Header");
const BODY_TAG = Symbol("RecessedCard.Body");
const TITLE_TAG = Symbol("RecessedCard.Header.Title");
const ADDON_TAG = Symbol("RecessedCard.Header.AddOn");

// ─── Scroll-shadow context ─────────────────────────────────────────────────

interface RecessedContextValue {
  scrolled: boolean;
  setScrolled: (v: boolean) => void;
}

const RecessedContext = createContext<RecessedContextValue | null>(null);

// ─── Sub-components ────────────────────────────────────────────────────────

interface TitleProps {
  children: ReactNode;
  className?: string;
}

function Title({ children, className }: TitleProps) {
  return (
    <p
      className={cn("text-sm uppercase tracking-widest text-text-secondary font-bold", className)}
      style={{ fontFamily: "var(--font-condensed)" }}
    >
      {children}
    </p>
  );
}
(Title as unknown as Record<symbol, boolean>)[TITLE_TAG] = true;

interface AddOnProps {
  children: ReactNode;
  className?: string;
}

function AddOn({ children, className }: AddOnProps) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}
(AddOn as unknown as Record<symbol, boolean>)[ADDON_TAG] = true;

interface HeaderProps {
  children: ReactNode;
  className?: string;
}

function Header({ children, className }: HeaderProps) {
  const ctx = use(RecessedContext);
  const scrolled = ctx?.scrolled ?? false;
  return (
    <div
      className={cn(
        "flex items-center justify-between mt-0.5 mb-2 px-2 flex-shrink-0 relative z-10 transition-shadow duration-150",
        scrolled && "shadow-[0_4px_8px_-2px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
(Header as unknown as Record<symbol, boolean>)[HEADER_TAG] = true;

// Attach nested compound parts to Header so callers can write
// `<RecessedCard.Header.Title>`.
(Header as typeof Header & { Title: typeof Title; AddOn: typeof AddOn }).Title = Title;
(Header as typeof Header & { Title: typeof Title; AddOn: typeof AddOn }).AddOn = AddOn;

interface BodyProps {
  children: ReactNode;
  className?: string;
  /** When true, body becomes an internal scroll container and drives the Header's drop-shadow. */
  scrollable?: boolean;
}

function Body({ children, className, scrollable = false }: BodyProps) {
  const ctx = use(RecessedContext);
  const handleScroll = scrollable
    ? (e: React.UIEvent<HTMLDivElement>) => ctx?.setScrolled(e.currentTarget.scrollTop > 0)
    : undefined;
  return (
    <div className={cn(scrollable && "flex-1 min-h-0 overflow-y-auto", className)} onScroll={handleScroll}>
      {children}
    </div>
  );
}
(Body as unknown as Record<symbol, boolean>)[BODY_TAG] = true;

// ─── Type guards ───────────────────────────────────────────────────────────

function hasTag(child: unknown, tag: symbol): boolean {
  if (!isValidElement(child)) return false;
  const type = child.type;
  return typeof type === "function" && (type as unknown as Record<symbol, boolean>)[tag] === true;
}

// ─── Main component ────────────────────────────────────────────────────────

interface RecessedCardProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
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
// standalone call-sites render unchanged.
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
 * ## Compound API
 *
 * ```tsx
 * <RecessedCard>
 *   <RecessedCard.Header>
 *     <RecessedCard.Header.Title>POPULAR TRACKS</RecessedCard.Header.Title>
 *     <RecessedCard.Header.AddOn>{infoButton}</RecessedCard.Header.AddOn>
 *   </RecessedCard.Header>
 *   <RecessedCard.Body scrollable>{list}</RecessedCard.Body>
 * </RecessedCard>
 * ```
 *
 * Header is optional. When `Body` receives `scrollable`, its internal scroll
 * position drives a drop-shadow on the Header (fades in/out with scrollTop).
 *
 * ## Cascade
 *
 * When nested inside an `EmbossedCard`, both `radius` and `padding`
 * default to values derived from the parent's published geometry
 * (`--emb-radius` / `--emb-padding`). Standalone defaults to 1 rem
 * radius + 1 rem padding. Set `radius` via prop, not via `rounded-*`
 * classes — the component needs to align the gradient-border arc
 * with the corner.
 */
function RecessedCardRoot({ children, className, ref, style, borderWidth, radius, padding }: RecessedCardProps) {
  const childArray = Children.toArray(children);
  const hasCompoundChild = childArray.some((c) => hasTag(c, HEADER_TAG) || hasTag(c, BODY_TAG));

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
    "--neu-radius-base": radiusBase,
    "--neu-radius-sm": radiusSm,
    ...(borderWidth ? { "--neu-border-width": borderWidth } : {}),
    borderRadius: "var(--neu-radius)",
    ...(paddingValue !== undefined ? { padding: paddingValue } : {}),
    ...style,
  } as React.CSSProperties;

  const [scrolled, setScrolled] = useState(false);

  const content = hasCompoundChild ? (
    <RecessedContext.Provider value={{ scrolled, setScrolled }}>{children}</RecessedContext.Provider>
  ) : (
    children
  );

  return (
    <div
      ref={ref}
      className={cn("recessed-gradient-border bg-black/25 backdrop-blur-md overflow-hidden", className)}
      style={mergedStyle}
    >
      {content}
    </div>
  );
}

export const RecessedCard = Object.assign(RecessedCardRoot, {
  Header: Header as typeof Header & { Title: typeof Title; AddOn: typeof AddOn },
  Body,
});
