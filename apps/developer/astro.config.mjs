import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  server: {
    port: Number(process.env.PORT) || 3002,
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["localhost", "developer.musiccloud.test"],
    },
    // Pre-bundle Phosphor for the client graph (avoids the "504 Outdated
    // Optimize Dep" churn when a new icon import appears). Deliberately NO
    // `ssr.noExternal` for it: piping the ~1.5k-module icon barrel through
    // Vite's SSR transform made every dev-mode page render take a constant
    // ~1.2s (measured 2026-07-04; the frontend app runs fine without it, and
    // Node resolves the package's ESM exports natively for SSR).
    optimizeDeps: { include: ["@phosphor-icons/react"] },
  },
  site: "https://developer.musiccloud.io",
});
