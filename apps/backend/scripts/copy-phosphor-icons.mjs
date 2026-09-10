// Copies the Phosphor duotone assets next to the built backend bundle, so the
// icon shortcode can read one of them at render time.
//
// They are files rather than part of the bundle because the whole set is 5.9 MB
// across 1512 icons, and a page names at most a handful. Bundling it would put
// all of it into memory to draw one symbol. Copied here rather than read out of
// node_modules, because the deployed artefact is `dist` alone.
//
// Called from `tsup.config.ts` `onSuccess` (build) and from the dev script in
// `package.json` (watch mode).

import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Through the link pnpm leaves in the workspace rather than through
// `require.resolve`, because the package exports its assets and nothing else,
// so there is no entry point to resolve from. `realpathSync` is what turns the
// link into the version-stamped directory the store actually holds.
const packageRoot = realpathSync(join(here, "..", "node_modules", "@phosphor-icons", "core"));
const source = join(packageRoot, "assets", "duotone");
const destination = join(here, "..", "dist", "icons", "duotone");

if (!existsSync(source)) {
  console.error(`[copy-phosphor-icons] source not found: ${source}`);
  process.exit(1);
}

mkdirSync(dirname(destination), { recursive: true });
rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log(`[copy-phosphor-icons] copied -> ${destination}`);
