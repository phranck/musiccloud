import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

/**
 * Astro's virtual modules the unit tests import, with the stand-in each one
 * gets. They only exist inside Astro's Vite pipeline, so plain Vitest cannot
 * resolve them, and the real implementations import further virtual modules.
 *
 * - `astro:transitions/client`: components such as OverlayContext and
 *   SharePageShell import `navigate()` for SPA navigation through the
 *   ClientRouter. Tests never exercise actual navigation, so a no-op is enough.
 * - `astro:middleware`: `defineMiddleware` only returns its handler, so the
 *   middleware's tests call the handler directly.
 */
const ASTRO_VIRTUAL_MODULE_STUBS: Record<string, string> = {
  "astro:transitions/client": "export const navigate = () => Promise.resolve();",
  "astro:middleware": "export const defineMiddleware = (handler) => handler;",
};

/** Resolves each stubbed Astro virtual module to its stand-in (Rollup convention: `\0` prefix). */
function stubAstroVirtualModules(): Plugin {
  return {
    name: "stub-astro-virtual-modules",
    resolveId(id) {
      return id in ASTRO_VIRTUAL_MODULE_STUBS ? `\0${id}` : undefined;
    },
    load(id) {
      return id.startsWith("\0") ? ASTRO_VIRTUAL_MODULE_STUBS[id.slice(1)] : undefined;
    },
  };
}

export default defineConfig({
  plugins: [react(), stubAstroVirtualModules()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
