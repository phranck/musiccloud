import {
  BarChart3,
  Database,
  LayoutDashboard,
  Music2,
  Settings,
  Users,
} from "lucide-react";
import { NavLink } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Übersicht",
    icon: LayoutDashboard,
    to: "/",
  },
  {
    label: "Tracks",
    icon: Music2,
    to: "/tracks",
  },
  {
    label: "Benutzer",
    icon: Users,
    to: "/users",
  },
  {
    label: "Traffic",
    icon: BarChart3,
    to: "/traffic",
  },
  {
    label: "System",
    icon: Settings,
    to: "/system",
  },
];

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Database className="h-5 w-5 text-sidebar-primary shrink-0" />
          <span className="font-semibold text-sm group-data-[collapsible=icon]:hidden">
            music.cloud
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <NavLink to={item.to} end={item.to === "/"}>
                    {({ isActive }) => (
                      <SidebarMenuButton isActive={isActive} tooltip={item.label}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2 text-xs text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
          Admin Dashboard
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
