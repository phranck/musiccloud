import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  // `@fastify/swagger-ui` ships its own static bundle (swagger-initializer.js,
  // logo.svg, etc.) and resolves paths relative to its own dist folder. If we
  // bundle it, those asset reads fail at runtime with ENOENT. Keeping it
  // external lets Node require it straight from node_modules.
  noExternal: [/^(?!better-sqlite3|@fastify\/swagger-ui).+/],
  external: ["better-sqlite3", "@fastify/swagger-ui"],
  outDir: "dist",
  clean: true,
});
