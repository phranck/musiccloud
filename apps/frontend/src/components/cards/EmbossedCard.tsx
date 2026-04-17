import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { embossedCardStyle } from "@/styles/neumorphic";

// ─── Sub-component type tags ───────────────────────────────────────────────

const HEADER_TAG = Symbol("EmbossedCard.Header");
const BODY_TAG = Symbol("EmbossedCard.Body");
const FOOTER_TAG = Symbol("EmbossedCard.Footer");
const ADDON_TAG = Symbol("EmbossedCard.AddOn");

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

function Header({ children, className }: HeaderProps) {
  return <div className={className}>{children}</div>;
}
(Header as unknown as Record<symbol, boolean>)[HEADER_TAG] = true;

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
}

/**
 * A card with a raised/embossed appearance. Light source from top-left:
 * bright highlight on top/left edges, dark shadow on bottom/right.
 *
 * Includes padding (p-4) and overflow hidden by default.
 * No default border-radius -- the caller must set it to match
 * the rule: outer radius - padding = inner radius.
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
export function EmbossedCard({ children, className, style }: EmbossedCardProps) {
  const childArray = Children.toArray(children);

  const headerChild = childArray.find((c) => hasTag(c, HEADER_TAG));
  const bodyChild = childArray.find((c) => hasTag(c, BODY_TAG));
  const footerChild = childArray.find((c) => hasTag(c, FOOTER_TAG));
  const leadingAddOns = childArray.filter(
    (c) => hasTag(c, ADDON_TAG) && isValidElement<AddOnProps>(c) && c.props.align === "leading",
  );
  const trailingAddOns = childArray.filter(
    (c) => hasTag(c, ADDON_TAG) && isValidElement<AddOnProps>(c) && c.props.align === "trailing",
  );

  const hasAddOns = leadingAddOns.length > 0 || trailingAddOns.length > 0;
  const isCompound = !!(headerChild || bodyChild || footerChild || hasAddOns);

  return (
    <div
      className={cn("embossed-gradient-border bg-white/[0.07] p-4 overflow-hidden", className)}
      style={{ ...embossedCardStyle, ...style }}
    >
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
          {bodyChild}
          {footerChild}
        </>
      ) : (
        children
      )}
    </div>
  );
}

EmbossedCard.Header = Header;
EmbossedCard.Body = Body;
EmbossedCard.Footer = Footer;
EmbossedCard.AddOn = AddOn;
