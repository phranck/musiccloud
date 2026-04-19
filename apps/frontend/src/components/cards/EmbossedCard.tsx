import { Children, isValidElement, type ReactNode } from "react";
import { EmbossedSegmentedControl } from "@/components/ui/EmbossedSegmentedControl";
import { cn } from "@/lib/utils";
import { embossedCardStyle } from "@/styles/neumorphic";

// ─── Sub-component type tags ───────────────────────────────────────────────

const HEADER_TAG = Symbol("EmbossedCard.Header");
const BODY_TAG = Symbol("EmbossedCard.Body");
const FOOTER_TAG = Symbol("EmbossedCard.Footer");
const ADDON_TAG = Symbol("EmbossedCard.AddOn");
const HEADER_ADDON_TAG = Symbol("EmbossedCard.Header.AddOn");
const SEGMENTS_TAG = Symbol("EmbossedCard.SegmentedControl");

interface HeaderProps {
  children: ReactNode;
  className?: string;
}

interface BodyProps {
  children: ReactNode;
  className?: string;
}

interface FooterProps {
  children: ReactNode;
  className?: string;
}

interface AddOnProps {
  children: ReactNode;
  align: "leading" | "trailing";
  className?: string;
}

interface HeaderAddOnProps {
  children: ReactNode;
  align: "leading" | "trailing";
  className?: string;
}

function HeaderAddOn({ children, className }: HeaderAddOnProps) {
  return <div className={className}>{children}</div>;
}
(HeaderAddOn as unknown as Record<symbol, boolean>)[HEADER_ADDON_TAG] = true;

function Header({ children, className }: HeaderProps) {
  const childArray = Children.toArray(children);
  const leading = childArray.filter(
    (c) => hasTag(c, HEADER_ADDON_TAG) && isValidElement<HeaderAddOnProps>(c) && c.props.align === "leading",
  );
  const trailing = childArray.filter(
    (c) => hasTag(c, HEADER_ADDON_TAG) && isValidElement<HeaderAddOnProps>(c) && c.props.align === "trailing",
  );
  const main = childArray.filter((c) => !hasTag(c, HEADER_ADDON_TAG));
  const hasHeaderAddons = leading.length > 0 || trailing.length > 0;

  if (!hasHeaderAddons) return <div className={className}>{children}</div>;

  // AddOns are positioned absolutely inside the header's padding box.
  // The inner relative wrapper inherits the Header's padding via classes
  // applied on the outer `className` — meaning left-0/right-0 on the
  // inner wrapper sits just inside the padding, not at the card edge.
  return (
    <div className={className}>
      <div className="relative flex items-center w-full min-h-8 gap-2">
        {leading.length > 0 && <div className="flex items-center shrink-0 mr-auto">{leading}</div>}
        <div className="flex-1 min-w-0 text-center">{main}</div>
        {trailing.length > 0 && <div className="flex items-center shrink-0 ml-auto">{trailing}</div>}
      </div>
    </div>
  );
}
(Header as unknown as Record<symbol, boolean>)[HEADER_TAG] = true;

type HeaderWithAddOn = typeof Header & { AddOn: typeof HeaderAddOn };
const TypedHeader = Header as HeaderWithAddOn;
TypedHeader.AddOn = HeaderAddOn;

function Body({ children, className }: BodyProps) {
  // `flex flex-col` is baked in so that callers using `flex-1 min-h-0` on
  // the Body's first child (grid / list wrapper) get flex-item behaviour
  // — without it, the child is a plain block and its flex utilities are
  // silently ignored, breaking scroll bounds.
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}
(Body as unknown as Record<symbol, boolean>)[BODY_TAG] = true;

function Footer({ children, className }: FooterProps) {
  return <div className={className}>{children}</div>;
}
(Footer as unknown as Record<symbol, boolean>)[FOOTER_TAG] = true;

function AddOn({ children, className }: AddOnProps) {
  return <div className={className}>{children}</div>;
}
(AddOn as unknown as Record<symbol, boolean>)[ADDON_TAG] = true;

// ─── Type guards ───────────────────────────────────────────────────────────

function hasTag(child: unknown, tag: symbol): boolean {
  if (!isValidElement(child)) return false;
  const type = child.type;
  return typeof type === "function" && (type as unknown as Record<symbol, boolean>)[tag] === true;
}

// ─── Main component ────────────────────────────────────────────────────────

interface EmbossedCardProps {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Outer padding as a CSS length (e.g. "0.75rem", "12px"). Applied as
   * `padding` on the root and published as `--emb-padding` so a nested
   * `RecessedCard` can derive its own padding (`--emb-padding / 2`).
   * Defaults to `0.75rem` (matches the 3-column reference layout).
   */
  padding?: string;
  /**
   * Outer corner radius. Single value or `{ base, sm }` for responsive
   * radii (swaps at the `sm` breakpoint, 640 px). Published as
   * `--emb-radius-base` / `--emb-radius-sm` so a nested `RecessedCard`
   * can derive its own radius (`outerRadius − outerPadding`).
   * Defaults to `1.875rem` (matches the 3-column reference layout).
   */
  radius?: string | { base: string; sm?: string };
}

const DEFAULT_PADDING = "0.75rem";
const DEFAULT_RADIUS = "1.875rem";

// Backward-compat detection: a caller that still sets `p-*` or `rounded-*`
// via the className is opting out of the cascaded geometry. Skip inline
// style + `--emb-padding`/`--emb-radius` publishing in that case so
// Tailwind's class wins and existing consumers render unchanged.
const PADDING_CLASS_RE = /(^|\s)p[xytrbls]?-/;
const ROUNDED_CLASS_RE = /(^|\s)rounded(\s|-|$)/;

/**
 * A card with a raised/embossed appearance. Light source from top-left:
 * bright highlight on top/left edges, dark shadow on bottom/right.
 *
 * Publishes its outer padding + radius as CSS custom properties
 * (`--emb-padding`, `--emb-radius`) so any descendant `RecessedCard`
 * automatically picks up the geometry and the inner card is inscribed
 * correctly inside the rounded outer frame.
 *
 * ## Compound API
 *
 * ```tsx
 * <EmbossedCard>
 *   <EmbossedCard.AddOn align="leading">Back</EmbossedCard.AddOn>
 *   <EmbossedCard.Header>Title + Subtitle</EmbossedCard.Header>
 *   <EmbossedCard.Body>Scrollable content</EmbossedCard.Body>
 *   <EmbossedCard.Footer>Footer actions</EmbossedCard.Footer>
 * </EmbossedCard>
 * ```
 *
 * When no sub-components are used, all children are rendered as-is
 * (backward compatible with the previous simple wrapper).
 *
 * AddOns are absolutely positioned left/right so the Header stays
 * centered regardless of asymmetric AddOn widths. The AddOn row is
 * only rendered when AddOns are present.
 */
export function EmbossedCard({ children, className, style, padding, radius }: EmbossedCardProps) {
  const childArray = Children.toArray(children);

  const headerChild = childArray.find((c) => hasTag(c, HEADER_TAG));
  const segmentsChild = childArray.find((c) => hasTag(c, SEGMENTS_TAG));
  const bodyChild = childArray.find((c) => hasTag(c, BODY_TAG));
  const footerChild = childArray.find((c) => hasTag(c, FOOTER_TAG));
  const leadingAddOns = childArray.filter(
    (c) => hasTag(c, ADDON_TAG) && isValidElement<AddOnProps>(c) && c.props.align === "leading",
  );
  const trailingAddOns = childArray.filter(
    (c) => hasTag(c, ADDON_TAG) && isValidElement<AddOnProps>(c) && c.props.align === "trailing",
  );

  const hasAddOns = leadingAddOns.length > 0 || trailingAddOns.length > 0;
  const isCompound = !!(headerChild || bodyChild || footerChild || hasAddOns || segmentsChild);

  // Only inline padding/radius when the caller didn't supply a `p-*` /
  // `rounded-*` className override. Falling back to defaults in the
  // "no prop + no class" case is what wires up the cascade for the new
  // reference layout.
  const paddingClassOverride = typeof className === "string" && PADDING_CLASS_RE.test(className);
  const radiusClassOverride = typeof className === "string" && ROUNDED_CLASS_RE.test(className);

  const effectivePadding = padding ?? (paddingClassOverride ? undefined : DEFAULT_PADDING);
  const effectiveRadius = radius ?? (radiusClassOverride ? undefined : DEFAULT_RADIUS);

  const radiusBase =
    effectiveRadius === undefined
      ? undefined
      : typeof effectiveRadius === "string"
        ? effectiveRadius
        : (effectiveRadius.base ?? DEFAULT_RADIUS);
  const radiusSm = typeof effectiveRadius === "object" ? effectiveRadius.sm : undefined;

  // Publish `--emb-radius-base/sm` + `--emb-padding` for descendant
  // RecessedCards to inherit (the @media swap in neumorphic.css picks the
  // active value into `--emb-radius`). Keep `--neu-radius-base/sm` in
  // lockstep so this card's own gradient-border transition arc aligns
  // with its actual rounded corner.
  const mergedStyle: React.CSSProperties = {
    ...embossedCardStyle,
    ...(effectivePadding !== undefined ? { "--emb-padding": effectivePadding, padding: "var(--emb-padding)" } : {}),
    ...(radiusBase !== undefined
      ? {
          "--emb-radius-base": radiusBase,
          "--emb-radius-sm": radiusSm ?? radiusBase,
          "--neu-radius-base": radiusBase,
          "--neu-radius-sm": radiusSm ?? radiusBase,
          borderRadius: "var(--emb-radius)",
        }
      : {}),
    ...style,
  } as React.CSSProperties;

  return (
    <div className={cn("embossed-gradient-border bg-white/[0.07] overflow-hidden", className)} style={mergedStyle}>
      {isCompound ? (
        <>
          {hasAddOns ? (
            <div className="relative flex-shrink-0">
              {headerChild && <div className="text-center">{headerChild}</div>}
              {leadingAddOns.length > 0 && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">{leadingAddOns}</div>
              )}
              {trailingAddOns.length > 0 && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">{trailingAddOns}</div>
              )}
            </div>
          ) : (
            headerChild
          )}
          {segmentsChild}
          {bodyChild}
          {footerChild}
        </>
      ) : (
        children
      )}
    </div>
  );
}

// Full-width segmented control slot — used by segmented content-page overlays
// and by the fullscreen segmented-page island. Reuses the project-wide
// SegmentedControl (recessed track + sliding embossed indicator) verbatim.
interface EmbossedSegmentedControlProps<T extends string> {
  segments: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

function SegmentedControlSlot<T extends string>({
  segments,
  value,
  onChange,
  className,
}: EmbossedSegmentedControlProps<T>) {
  return (
    <div className={cn("w-full mt-3", className)}>
      <EmbossedSegmentedControl segments={segments} value={value} onChange={onChange} className="w-full" />
    </div>
  );
}
(SegmentedControlSlot as unknown as Record<symbol, boolean>)[SEGMENTS_TAG] = true;

EmbossedCard.Header = TypedHeader;
EmbossedCard.Body = Body;
EmbossedCard.Footer = Footer;
EmbossedCard.AddOn = AddOn;
EmbossedCard.SegmentedControl = SegmentedControlSlot;
