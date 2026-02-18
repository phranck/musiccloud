import { Outlet, useLocation } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useT } from "@/i18n/context";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

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
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <AppHeader title={t(titleKey)} />
          <main className="flex flex-1 flex-col gap-4 p-4">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
