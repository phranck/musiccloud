import { BrandName } from "@/shared/ui/BrandName";

export function SidebarHeader() {
  return (
    <div className="h-14 flex items-center justify-center border-b border-[var(--ds-border)] shrink-0 text-2xl">
      <BrandName />
    </div>
  );
}
