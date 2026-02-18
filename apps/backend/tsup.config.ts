import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/^(?!better-sqlite3).+/],
  external: ["better-sqlite3"],
  outDir: "dist",
  clean: true,
});
