import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const HEADER_TAG = Symbol("TranslucentCard.Header");
const BODY_TAG = Symbol("TranslucentCard.Body");
const FOOTER_TAG = Symbol("TranslucentCard.Footer");
const SEGMENTS_TAG = Symbol("TranslucentCard.SegmentedControl");

function tagged<P extends object>(Component: (p: P) => ReactElement, tag: symbol) {
  (Component as unknown as Record<symbol, boolean>)[tag] = true;
  return Component;
}

function hasTag(child: unknown, tag: symbol): boolean {
  if (!isValidElement(child)) return false;
  const type = child.type;
  return typeof type === "function" && (type as unknown as Record<symbol, boolean>)[tag] === true;
}

interface TranslucentCardProps {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Glassy overlay card — backdrop-blur + semi-transparent white surface.
 * Used by the translucent-mode content-page overlay.
 */
export function TranslucentCard({ children, className, style }: TranslucentCardProps) {
  const arr = Children.toArray(children);
  const header = arr.find((c) => hasTag(c, HEADER_TAG));
  const segments = arr.find((c) => hasTag(c, SEGMENTS_TAG));
  const body = arr.find((c) => hasTag(c, BODY_TAG));
  const footer = arr.find((c) => hasTag(c, FOOTER_TAG));
  const isCompound = !!(header || body || footer || segments);

  return (
    <div
      className={cn(
        "flex flex-col",
        "bg-white/[0.05] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden",
        className,
      )}
      style={style}
    >
      {isCompound ? (
        <>
          {header}
          {segments}
          {body}
          {footer}
        </>
      ) : (
        children
      )}
    </div>
  );
}

interface HeaderProps {
  children: ReactNode;
  className?: string;
}

TranslucentCard.Header = tagged(function Header({ children, className }: HeaderProps) {
  return <div className={cn("flex-shrink-0 px-6 pt-5", className)}>{children}</div>;
}, HEADER_TAG);

interface BodyProps {
  children: ReactNode;
  className?: string;
}

TranslucentCard.Body = tagged(function Body({ children, className }: BodyProps) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}, BODY_TAG);

interface FooterProps {
  children: ReactNode;
  className?: string;
}

TranslucentCard.Footer = tagged(function Footer({ children, className }: FooterProps) {
  return <div className={cn("flex-shrink-0 px-6 pb-5", className)}>{children}</div>;
}, FOOTER_TAG);

interface SegmentedControlProps {
  segments: { key: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  className?: string;
}

// Tab-row style segmented control (bottom-border active indicator), used by
// the translucent content-page overlay. Shares the glassy look with the
// card surface.
TranslucentCard.SegmentedControl = tagged(function Segments({
  segments,
  value,
  onChange,
  className,
}: SegmentedControlProps): ReactElement {
  return (
    <div role="tablist" className={cn("flex gap-6 border-b border-white/[0.08] px-6 flex-shrink-0", className)}>
      {segments.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "pb-3 text-base font-medium tracking-[-0.01em] transition-colors duration-150 border-b-2 -mb-px focus:outline-none",
            value === key ? "text-white border-white/50" : "text-white/30 border-transparent hover:text-white/55",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}, SEGMENTS_TAG);
