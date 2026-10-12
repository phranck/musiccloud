import node from "@astrojs/node";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { SITE_ORIGIN } from "@musiccloud/shared";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { astroViteCacheDir } from "../../scripts/astro-vite-cache-dir.mjs";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [sitemap(), react()],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  vite: {
    cacheDir: astroViteCacheDir(),
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["localhost", "musiccloud.test"],
    },
  },
  site: SITE_ORIGIN.site,
  // Astro hashes every script and style it emits into a `content-security-policy`
  // header. The middleware replaces it with the site's complete policy, which
  // carries those hashes.
  experimental: { csp: true },
});
