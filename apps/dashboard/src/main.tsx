import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import "virtual:uno.css";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthContext";
import { clearLegacyDashboardLocalePreference } from "./lib/legacy-locale-cleanup";
import { KeyboardSaveProvider } from "./lib/useKeyboardSave";
import { routes } from "./routes";

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

const router = createBrowserRouter(routes);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
clearLegacyDashboardLocalePreference();
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <IconContext.Provider
          value={{
            weight: "duotone",
            style: {
              transform: "scale(1.16)",
              transformBox: "fill-box",
              transformOrigin: "center",
            },
          }}
        >
          <AuthProvider>
            <KeyboardSaveProvider>
              <RouterProvider router={router} />
            </KeyboardSaveProvider>
          </AuthProvider>
        </IconContext.Provider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
