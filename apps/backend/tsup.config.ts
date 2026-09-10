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
  // Three sets of assets live on disk at runtime rather than in the bundle.
  // Jimp's TTF fonts cannot be inlined at all, and the two icon sets are 6 MB
  // together of which a page uses a handful. Iconsax ships components rather
  // than assets, so its shapes are extracted here rather than copied. All three
  // land next to the built bundle so `__dirname` resolves them in production.
  onSuccess:
    "node scripts/copy-jimp-fonts.mjs && node scripts/copy-phosphor-icons.mjs && node scripts/build-iconsax-bulk.mjs",
  outDir: "dist",
  clean: true,
});
