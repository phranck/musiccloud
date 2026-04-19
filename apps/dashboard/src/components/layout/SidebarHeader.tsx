import { LogoView } from "@/shared/ui/LogoView";

export function SidebarHeader() {
  return (
    <div className="h-14 flex items-center justify-center border-b border-[var(--ds-border)] shrink-0">
      <LogoView className="h-7 w-auto" />
    </div>
  );
}
