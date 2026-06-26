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
  },
  site: "https://developer.musiccloud.io",
});
