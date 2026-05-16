// Copies runtime font assets next to the built backend bundle, so
// `opentype.loadSync(path.join(__dirname, ...))` and the OpenAPI docs'
// `/fonts/*` routes resolve correctly once tsup inlines the source into
// `dist/server.js`.
// Called from `tsup.config.ts` `onSuccess` (build) and from the dev script
// in `package.json` (watch mode).

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
