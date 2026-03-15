import { BarChart3, Database, Disc, LayoutDashboard, LogOut, Music2, Settings, Users } from "lucide-react";
import { NavLink, useNavigate } from "react-router";
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
import { useAuth } from "@/contexts/AuthContext";
import { useT } from "@/i18n/context";

export function AppSidebar() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const navItems = [
    { labelKey: "nav.overview", icon: LayoutDashboard, to: "/" },
    { labelKey: "nav.tracks", icon: Music2, to: "/tracks" },
    { labelKey: "nav.albums", icon: Disc, to: "/albums" },
    { labelKey: "nav.users", icon: Users, to: "/users" },
    { labelKey: "nav.traffic", icon: BarChart3, to: "/traffic" },
    { labelKey: "nav.system", icon: Settings, to: "/system" },
  ];

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <Database className="h-5 w-5 text-sidebar-primary shrink-0" />
          <span className="font-semibold text-sm group-data-[collapsible=icon]:hidden">musiccloud</span>
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
                      <SidebarMenuButton isActive={isActive} tooltip={t(item.labelKey)}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
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
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t("sidebar.logout")} onClick={handleLogout}>
              <LogOut />
              <span className="flex-1 truncate">{username ?? t("auth.admin")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
