import { BrowserRouter, Route, Routes } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { Overview } from "@/pages/Overview";
import { Tracks } from "@/pages/Tracks";
import { Users } from "@/pages/Users";
import { Traffic } from "@/pages/Traffic";
import { System } from "@/pages/System";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="tracks" element={<Tracks />} />
          <Route path="users" element={<Users />} />
          <Route path="traffic" element={<Traffic />} />
          <Route path="system" element={<System />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
