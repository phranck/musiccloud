import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A section that animates open/closed via CSS grid-template-rows transition.
 * Used in ArtistInfoCard for collapsible profile/tracks/events/similar sections.
 */
const COLLAPSE_DURATION_MS = 680;

export function CollapsibleSection({
  disableMobileCollapse = false,
  visible,
  sectionClass,
  children,
}: {
  disableMobileCollapse?: boolean;
  visible: boolean;
  sectionClass?: string;
  children: ReactNode;
}) {
  const [renderedChildren, setRenderedChildren] = useState<ReactNode>(() => (visible ? children : null));
  const shouldDisableMobileCollapse = disableMobileCollapse && renderedChildren !== null;

  useEffect(() => {
    if (visible) {
      setRenderedChildren(children);
      return;
    }

    const timeout = setTimeout(() => setRenderedChildren(null), COLLAPSE_DURATION_MS + 80);
    return () => clearTimeout(timeout);
  }, [children, visible]);
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[680ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        shouldDisableMobileCollapse && "max-sm:grid-rows-[1fr] max-sm:opacity-100",
      )}
    >
      <div className="overflow-hidden">
        <div className={cn(sectionClass)}>{renderedChildren}</div>
      </div>
    </div>
  );
}
