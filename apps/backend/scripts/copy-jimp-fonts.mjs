// Copies runtime font assets (TTF for Roboto Condensed) next to the built
// backend bundle, so `opentype.loadSync(path.join(__dirname, ...))`
// resolves correctly once tsup inlines the source into `dist/server.js`.
//
// Same pattern as `copy-swagger-ui-assets.mjs`: `cpSync` from the
// checked-in assets folder into the build output. Called from
// `tsup.config.ts` `onSuccess` (build) and from the dev script in
// `package.json` (watch mode). The name is kept for backward
// compatibility with existing build scripts — see tsup.config.ts.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcFonts = join(here, "..", "assets", "fonts");
const destFonts = join(here, "..", "dist", "fonts");

if (!existsSync(srcFonts)) {
  console.error(`[copy-fonts] source not found: ${srcFonts}`);
  process.exit(1);
}

mkdirSync(dirname(destFonts), { recursive: true });
rmSync(destFonts, { recursive: true, force: true });
cpSync(srcFonts, destFonts, { recursive: true });
console.log(`[copy-fonts] copied -> ${destFonts}`);
