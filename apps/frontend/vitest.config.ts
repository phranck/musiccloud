import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/** Resolved id marker for the stubbed Astro virtual module (Rollup convention: \0 prefix). */
const ASTRO_TRANSITIONS_CLIENT_STUB_ID = "\0astro:transitions/client";

/**
 * Stubs Astro's virtual module `astro:transitions/client` for unit tests.
 *
 * Components such as OverlayContext/SharePageShell import `navigate()` from
 * this module for SPA navigation via the ClientRouter. The module only exists
 * inside Astro's Vite pipeline; plain Vitest cannot resolve it (and the real
 * implementation transitively imports further virtual modules). Tests never
 * exercise actual navigation, so a no-op `navigate` is sufficient.
 */
function stubAstroTransitionsClient(): Plugin {
  return {
    name: "stub-astro-transitions-client",
    resolveId(id) {
      return id === "astro:transitions/client" ? ASTRO_TRANSITIONS_CLIENT_STUB_ID : undefined;
    },
    load(id) {
      return id === ASTRO_TRANSITIONS_CLIENT_STUB_ID ? "export const navigate = () => Promise.resolve();" : undefined;
    },
  };
}

export default defineConfig({
  plugins: [react(), stubAstroTransitionsClient()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
