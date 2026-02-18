import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LocaleProvider } from "@/i18n/context";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Overview } from "@/pages/Overview";
import { Tracks } from "@/pages/Tracks";
import { Users } from "@/pages/Users";
import { Traffic } from "@/pages/Traffic";
import { System } from "@/pages/System";
import { Login } from "@/pages/Login";
import { Setup } from "@/pages/Setup";

export function App() {
  return (
    <ThemeProvider>
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
                <Route path="users" element={<Users />} />
                <Route path="traffic" element={<Traffic />} />
                <Route path="system" element={<System />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
