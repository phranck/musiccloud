import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  bundle: true,
  noExternal: ["@musiccloud/shared"],
  external: ["better-sqlite3"],
  outDir: "dist",
  clean: true,
});
