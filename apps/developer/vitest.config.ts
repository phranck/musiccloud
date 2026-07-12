import { getViteConfig } from "astro/config";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Vitest config for Developer Portal unit and component tests.
 *
 * `getViteConfig` wires Astro's Vite plugin into Vitest so `.astro`
 * components can be rendered through `astro/container` instead of being
 * parsed as plain JavaScript.
 */
const astroViteConfig = getViteConfig({});

export default defineConfig(async (env) =>
  mergeConfig(await astroViteConfig(env), {
    test: {
      environment: "node",
    },
  }),
);
