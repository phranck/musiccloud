import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/scripts/crawler-heartbeat.ts", "src/scripts/api-usage-retention.ts"],
  // CommonJS is a runtime contract, not merely a bundler preference. The
  // server entrypoint uses `module === require.main`; changing this format
  // requires changing and re-running the direct-entry and deploy smoke gates.
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/.+/],
  // Two sets of assets live on disk at runtime rather than in the bundle.
  // Jimp's TTF fonts cannot be inlined at all, and the Phosphor duotone set is
  // 5.9 MB of which a page uses a handful. Both are copied next to the built
  // bundle so `__dirname` resolves them in production.
  onSuccess: "node scripts/copy-jimp-fonts.mjs && node scripts/copy-phosphor-icons.mjs",
  outDir: "dist",
  clean: true,
});
