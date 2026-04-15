import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  noExternal: [/^(?!better-sqlite3).+/],
  external: ["better-sqlite3"],
  // `@fastify/swagger-ui` reads its static bundle (logo.svg, index.html,
  // swagger-ui-bundle.js, etc.) from disk at runtime via
  // `path.join(__dirname, 'static', ...)`. When we bundle everything into
  // `dist/server.js`, `__dirname` becomes `dist/`, so the plugin looks for
  // `dist/static/*`. Copy the package's `static/` folder next to the bundle
  // on build success, and in `server.ts` pass `baseDir` pointing there so
  // the static-file route also resolves correctly.
  onSuccess: "node scripts/copy-swagger-ui-assets.mjs",
  outDir: "dist",
  clean: true,
});
