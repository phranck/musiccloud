import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/scripts/crawler-heartbeat.ts"],
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/^(?!better-sqlite3).+/],
  external: ["better-sqlite3"],
  // Jimp's TTF fonts live on disk at runtime and cannot be inlined by the
  // bundler. Copy them next to the built bundle so `loadFont` resolves
  // correctly in production.
  onSuccess: "node scripts/copy-jimp-fonts.mjs",
  outDir: "dist",
  clean: true,
});
