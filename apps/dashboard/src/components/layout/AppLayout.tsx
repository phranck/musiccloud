import { Outlet, useLocation } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";

const PAGE_TITLE_KEYS: Record<string, string> = {
  "/": "pages.overview",
  "/tracks": "pages.tracks",
  "/users": "pages.users",
  "/traffic": "pages.traffic",
  "/system": "pages.system",
};

export function AppLayout() {
  const location = useLocation();
  const t = useT();
  const titleKey = PAGE_TITLE_KEYS[location.pathname] ?? "pages.overview";

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <AppSidebar />
        <SidebarInset className="overflow-hidden">
          <AppHeader title={t(titleKey)} />
          <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
