import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// A production build must never overwrite the optimized modules consumed by a
// long-running local dev server. Astro's static config does not receive the
// command, so select the Vite cache from the CLI arguments it forwards.
const viteCacheDir = process.argv.includes("build") ? "node_modules/.vite-build" : "node_modules/.vite-dev";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  server: {
    port: Number(process.env.PORT) || 3002,
  },
  vite: {
    cacheDir: viteCacheDir,
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ["localhost", "developer.musiccloud.test"],
    },
    // Pre-bundle the icon barrels for the client graph (avoids the "504
    // Outdated Optimize Dep" churn when a new icon import appears): Iconsax
    // is the portal's icon set (MC-103, `@/lib/icons`), Phosphor remains for
    // the GitHub brand mark only. Deliberately NO `ssr.noExternal` for them:
    // piping a ~1.5k-module icon barrel through Vite's SSR transform made
    // every dev-mode page render take a constant ~1.2s (measured 2026-07-04;
    // Node resolves the packages' exports natively for SSR).
    optimizeDeps: { include: ["@phosphor-icons/react", "iconsax-react"] },
  },
  site: "https://developer.musiccloud.io",
});
