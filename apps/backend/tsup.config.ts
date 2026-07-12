import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/scripts/crawler-heartbeat.ts"],
  // CommonJS is a runtime contract, not merely a bundler preference. The
  // server entrypoint uses `module === require.main`; changing this format
  // requires changing and re-running the direct-entry and deploy smoke gates.
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/.+/],
  // Jimp's TTF fonts live on disk at runtime and cannot be inlined by the
  // bundler. Copy them next to the built bundle so `loadFont` resolves
  // correctly in production.
  onSuccess: "node scripts/copy-jimp-fonts.mjs",
  outDir: "dist",
  clean: true,
});
