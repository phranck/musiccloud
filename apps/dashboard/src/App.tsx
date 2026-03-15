import { BrowserRouter, Route, Routes } from "react-router";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/i18n/context";
import { Albums } from "@/pages/Albums";
import { Login } from "@/pages/Login";
import { Overview } from "@/pages/Overview";
import { Setup } from "@/pages/Setup";
import { System } from "@/pages/System";
import { Tracks } from "@/pages/Tracks";
import { Traffic } from "@/pages/Traffic";
import { Users } from "@/pages/Users";

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <LocaleProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/setup" element={<Setup />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Overview />} />
                  <Route path="tracks" element={<Tracks />} />
                  <Route path="albums" element={<Albums />} />
                  <Route path="users" element={<Users />} />
                  <Route path="traffic" element={<Traffic />} />
                  <Route path="system" element={<System />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LocaleProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
