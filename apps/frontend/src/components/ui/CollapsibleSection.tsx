import { cn } from "@/lib/utils";

/**
 * A section that animates open/closed via CSS grid-template-rows transition.
 * Used in ArtistInfoCard for collapsible profile/tracks/events/similar sections.
 */
export function CollapsibleSection({
  visible,
  sectionClass,
  children,
}: {
  visible: boolean;
  sectionClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <div className={cn(sectionClass)}>{children}</div>
      </div>
    </div>
  );
}
