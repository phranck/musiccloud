import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [
    sitemap(),
    react(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  site: "https://musiccloud.io",
});
