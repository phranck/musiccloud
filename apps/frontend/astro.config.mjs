import node from "@astrojs/node";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss()],
  },
  site: "https://musiccloud.io",
});
