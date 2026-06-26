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
    // Phosphor icons render as SSR-only React islands (no client directive).
    // Pre-bundle for dev and keep them in the SSR bundle so the same copy is
    // used on both sides — avoids the "504 Outdated Optimize Dep" / externalised
    // ESM-resolution issues that otherwise hit @phosphor-icons/react in Astro.
    optimizeDeps: { include: ["@phosphor-icons/react"] },
    ssr: { noExternal: ["@phosphor-icons/react"] },
  },
  site: "https://developer.musiccloud.io",
});
