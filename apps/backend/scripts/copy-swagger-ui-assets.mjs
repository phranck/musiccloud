// Copies `@fastify/swagger-ui/static` next to the built backend bundle.
//
// Why a Node script and not a shell `cp`: tsup's `onSuccess` string runs
// through its own process handling and the relative-path resolution is
// fragile across platforms. `require.resolve` finds the package no matter
// where npm hoisted it (root vs. per-workspace node_modules) and on any OS.
//
// Called from `tsup.config.ts` `onSuccess` (build) and from the dev script
// in package.json (watch mode).

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

// Resolve the package entry, then climb to its folder.
const pkgJsonPath = require.resolve("@fastify/swagger-ui/package.json");
const srcStatic = join(dirname(pkgJsonPath), "static");

const destStatic = join(here, "..", "dist", "static");

if (!existsSync(srcStatic)) {
  console.error(`[copy-swagger-ui-assets] source not found: ${srcStatic}`);
  process.exit(1);
}

mkdirSync(dirname(destStatic), { recursive: true });
rmSync(destStatic, { recursive: true, force: true });
cpSync(srcStatic, destStatic, { recursive: true });
console.log(`[copy-swagger-ui-assets] copied -> ${destStatic}`);
